import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import {
  QUEUE_TICKET_ISSUER,
  DossierQueueTicketIssuer,
} from '../../../../common/queue/dossier-queue-ticket-issuer.port';
import {
  NOTIFICATION_PUBLISHER,
  NotificationPublisher,
} from '../../../../common/notifications/notification-publisher.port';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { readUniqueViolation } from '../../../../common/persistence/unique-violation';
import { BorderGateConfig, GateDirection } from '../../../catalog/domain/border-facility.catalog';
import { NotificationType } from '../../../notifications/domain/notification-type.enum';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../../../declarations/application/ports/declaration.repository';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { Declaration } from '../../../declarations/domain/declaration.entity';
import { DeclarationStatus, ForceStatus, WorkflowStepCode } from '../../../declarations/domain/declaration.enums';
import { GateStepDirection, workflowStepMetadata } from '../../../declarations/domain/workflow-step.catalog';
import { effectiveRouteForInstance } from '../../../workflow/domain/fee-step-gate.rules';
import {
  DISPATCH_ASSIGNMENT_REPOSITORY,
  DispatchAssignmentRepository,
} from '../../../dispatch/application/ports/dispatch-assignment.repository';
import {
  WORKFLOW_INSTANCE_REPOSITORY,
  WorkflowInstanceRepository,
} from '../../../workflow/application/ports/workflow-instance.repository';
import { WorkflowProvisioningService } from '../../../workflow/application/services/workflow-provisioning.service';
import { WorkflowRouteService } from '../../../workflow/application/services/workflow-route.service';
import { gateAuditActionFor } from '../../domain/gate-audit-action';
import { GatePassageViolation, checkGatePassage } from '../../domain/gate-condition.rules';
import { GateChecklistState, GateDecision, GateEvent } from '../../domain/gate-event.entity';
import { GateEventView, toGateEventView } from '../dto/gate-view.dto';
import { RecordGateEventCommand } from '../dto/record-gate-event.command';
import { GATE_EVENT_REPOSITORY, GateEventRepository } from '../ports/gate-event.repository';
import { GateEvaluationService } from '../services/gate-evaluation.service';
import { appNotFound, appConflict, MessageKey, MessageParams } from '../../../../common/i18n';

/**
 * Ghi nhận sự kiện qua cổng (F38) và **chặn cho qua khi chưa đủ điều kiện** (F39).
 *
 * Đây là chỗ chốt DoD của P4: `decision = ALLOW` mà đánh giá còn điều kiện thiếu thì trả **409**
 * kèm nguyên danh sách `blockingReasons`. Chặn nằm ở API chứ không phải ở việc ẩn nút trên giao
 * diện — gọi thẳng endpoint cũng không lách được.
 *
 * `decision = DENY` **luôn ghi được**, và ghi lại đúng những gì còn thiếu tại thời điểm đó.
 */
@Injectable()
export class RecordGateEventUseCase {
  constructor(
    @Inject(GATE_EVENT_REPOSITORY)
    private readonly events: GateEventRepository,
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    @Inject(DISPATCH_ASSIGNMENT_REPOSITORY)
    private readonly assignments: DispatchAssignmentRepository,
    @Inject(WORKFLOW_INSTANCE_REPOSITORY)
    private readonly instances: WorkflowInstanceRepository,
    private readonly scope: DossierScopeService,
    private readonly evaluator: GateEvaluationService,
    private readonly routes: WorkflowRouteService,
    private readonly provisioning: WorkflowProvisioningService,
    @Inject(NOTIFICATION_PUBLISHER)
    private readonly notifications: NotificationPublisher,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
    @Inject(QUEUE_TICKET_ISSUER)
    private readonly queueIssuer: DossierQueueTicketIssuer,
  ) {}

  private readonly logger = new Logger(RecordGateEventUseCase.name);

  async execute(command: RecordGateEventCommand): Promise<{ event: GateEventView }> {
    const declaration = await this.declarations.findById(command.dossierId);
    if (!declaration) throw appNotFound('gate.dossierNotFound');
    this.scope.assertAccessible(declaration, command.access);

    const overrides: GateChecklistState[] = (command.checklist ?? []).map((item) => ({
      code: item.code,
      checked: item.checked,
      note: item.note ?? null,
    }));

    const gate = await this.evaluator.resolveGate(command.gateCode, command.direction);
    const snapshot = await this.evaluator.evaluate(declaration, gate, overrides);

    if (command.decision === GateDecision.ALLOW && !snapshot.evaluation.canOpen) {
      throw appConflict(
        'gate.blocked',
        { dossierCode: declaration.code, gateName: gate.name },
        { blockingReasons: snapshot.evaluation.blockingReasons },
      );
    }

    // F38 — chống ghi lặp / sai trình tự lượt vào-ra. Áp dụng cho cả CHO QUA và TỪ CHỐI (hồ sơ đã rời cửa khẩu / sai luồng không được ghi thêm sự kiện).
    await this.assertPassageOrder(declaration, gate);

    const event = GateEvent.record({
      dossierId: declaration.id,
      gateCode: gate.code,
      direction: gate.direction,
      decision: command.decision,
      canOpen: snapshot.evaluation.canOpen,
      statusColor: snapshot.evaluation.statusColor,
      blockingReasons: snapshot.evaluation.blockingReasons,
      checklist: snapshot.checklist.map((item) => ({ code: item.code, checked: item.checked, note: item.note })),
      note: command.note ?? null,
      actorId: command.actorId,
      // BUG-020 — lưu tên người thao tác thật (từ token) để cột "Người xử lý" không còn trống.
      actorName: command.actorName ?? null,
    });

    const saved = await this.appendOrConflict(event, declaration.code, gate);
    await this.recordAudit(declaration, gate, saved, command.access);
    await this.completeEntryGateStepIfEntered(declaration, gate, saved, command.access, command.prioritizeQuarantine ?? false);
    await this.completeExitIfLeft(declaration, gate, saved, command.access);
    await this.recordRejectionOnDeclarationIfDenied(declaration, gate, saved, command.access);
    await this.releasePositionIfLeft(saved);
    await this.publishNotification(declaration, gate.name, saved);
    await this.issueQueueTicketIfEntered(declaration, saved);

    return { event: toGateEventView(saved, declaration.code, declaration.vehicle?.plateNumber ?? '', gate.name) };
  }

  /**
   * Xe bị từ chối tại cổng → lưu vết thao tác nghiệp vụ lên hồ sơ kèm lý do từ chối để
   * tra cứu chi tiết hồ sơ cũng thấy rõ lịch sử bị chặn ở cổng.
   */
  private async recordRejectionOnDeclarationIfDenied(
    declaration: Declaration,
    gate: BorderGateConfig,
    event: GateEvent,
    access: UserAccessContext,
  ): Promise<void> {
    if (event.decision !== GateDecision.DENY) return;
    const actorRole = access.roles.map((role) => role.code).join('+') || undefined;
    const reasonText = event.note ? ` Lý do: ${event.note}` : '';
    declaration.recordOperationAction(
      event.actorId,
      actorRole || 'NHAN_VIEN_CONG',
      `Từ chối cho qua cổng ${gate.name}.${reasonText}`,
    );
    await this.declarations.save(declaration);
  }

  /**
   * Xe được CHO QUA **cổng vào** → tự cấp số thứ tự để hồ sơ vào ngay cột "Chờ điều phối" của bảng
   * Điều phối (SRS 4.1). **Chỉ** áp cho cổng VÀO (`ENTRY`) + quyết định CHO QUA (`ALLOW`); cổng RA
   * và quyết định TỪ CHỐI không cấp số.
   *
   * **Best-effort**: cấp số là hệ quả phụ, không được làm hỏng việc ghi sự kiện cổng — lỗi chỉ ghi
   * cảnh báo, sự kiện cổng vẫn được ghi thành công (giống nếp tự tính phí ở bước thu phí). Việc cấp
   * số là **idempotent** trong ngày, do adapter và `IssueQueueTicketUseCase` tự chống trùng.
   */
  private async issueQueueTicketIfEntered(declaration: Declaration, event: GateEvent): Promise<void> {
    if (event.direction !== GateDirection.ENTRY || event.decision !== GateDecision.ALLOW) return;
    try {
      await this.queueIssuer.ensureIssued(declaration.id, event.actorId);
    } catch (error) {
      this.logger.warn(
        `Không tự cấp được số thứ tự cho hồ sơ ${declaration.code} khi xe qua cổng vào ` +
          `(sự kiện cổng vẫn được ghi): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Kiểm **trình tự lượt vào/ra** trước khi ghi một quyết định CHO QUA (F38): hồ sơ đã rời cửa
   * khẩu thì không ghi thêm; cổng RA phải có lượt VÀO trước; không cho VÀO lại sau khi đã RA; và
   * mỗi chiều chỉ được CHO QUA đúng một lần. Đọc lịch sử lượt cho qua từ chính bảng `gate_events`.
   */
  private async assertPassageOrder(declaration: Declaration, gate: BorderGateConfig): Promise<void> {
    const directions = await this.events.findAllowedDirections(declaration.id);
    const violation = checkGatePassage(gate.direction, {
      alreadyLeft:
        declaration.status === DeclarationStatus.EXITED || declaration.status === DeclarationStatus.COMPLETED,
      hasAllowedEntry: directions.includes(GateDirection.ENTRY),
      hasAllowedExit: directions.includes(GateDirection.EXIT),
    });
    if (violation) throw this.passageConflict(violation, declaration.code, gate.name);
  }

  /** Ánh xạ mã vi phạm trình tự sang lỗi 409 kèm thông báo tiếng Việt có dấu. */
  private passageConflict(violation: GatePassageViolation, dossierCode: string, gateName: string) {
    const keys: Record<GatePassageViolation, MessageKey> = {
      ALREADY_LEFT: 'gate.alreadyLeft',
      DUPLICATE_ENTRY: 'gate.duplicateEntry',
      DUPLICATE_EXIT: 'gate.duplicateExit',
      EXIT_BEFORE_ENTRY: 'gate.exitBeforeEntry',
      ENTRY_AFTER_EXIT: 'gate.entryAfterExit',
    };
    return appConflict(keys[violation], { dossierCode, gateName });
  }

  /**
   * Ghi sự kiện rồi bắt lỗi trùng chỉ mục duy nhất (PostgreSQL `23505`) — chỗ chốt chống đua: hai
   * yêu cầu cùng ghi CHO QUA một chiều đọc thấy "chưa có ai" ở `assertPassageOrder`, chỉ ràng buộc
   * ở tầng database mới chặn được (theo tiền lệ "1 xe không 2 vị trí").
   */
  private async appendOrConflict(event: GateEvent, dossierCode: string, gate: BorderGateConfig): Promise<GateEvent> {
    try {
      return await this.events.append(event);
    } catch (error) {
      if (readUniqueViolation(error)) {
        throw appConflict('gate.duplicatePassage', { dossierCode, gateName: gate.name });
      }
      throw error;
    }
  }

  /**
   * BUG-009 — mỗi sự kiện qua cổng để lại **vết kiểm toán bất biến** ở bảng `audit_logs` (F05):
   * ghi mã hành động rõ nghĩa (`GATE_EVENT_ALLOW`/`GATE_EVENT_DENY`) kèm ảnh chụp tối thiểu của
   * quyết định. Trước đây use-case này không gọi `AUDIT_LOGGER` nên khâu cổng mất hẳn dấu vết.
   */
  private async recordAudit(
    declaration: Declaration,
    gate: BorderGateConfig,
    event: GateEvent,
    access: UserAccessContext,
  ): Promise<void> {
    await this.audit.record({
      action: gateAuditActionFor(event.decision),
      targetType: 'DECLARATION',
      targetId: declaration.id,
      actorId: event.actorId,
      actorRole: access.roles.map((role) => role.code).join('+') || undefined,
      before: null,
      after: {
        dossierCode: declaration.code,
        gateCode: gate.code,
        direction: event.direction,
        decision: event.decision,
        canOpen: event.canOpen,
        statusColor: event.statusColor,
        blockingReasons: event.blockingReasons,
        note: event.note,
      },
    });
  }

  /**
   * CR7 — xe được cho qua **cổng vào** (Biên phòng xác nhận xe vào) khép **bước cổng VÀO** của phiên
   * liên ngành do chính sự kiện cổng (không qua `/workflow/.../decide`) rồi đẩy hồ sơ sang bước kiểm
   * tra kế tiếp. Khác cổng ra: KHÔNG đặt hồ sơ sang EXITED/COMPLETED, chỉ tiến bước và đồng bộ trạng thái.
   *
   * Chỉ áp cho sự kiện CHO QUA (`ALLOW`) chiều VÀO (`ENTRY`), và chỉ khi phiên đang đứng đúng ở bước
   * cổng VÀO — tránh khép nhầm bước lực lượng. Bước không phải cổng vào thì bỏ qua (idempotent).
   */
  private async completeEntryGateStepIfEntered(
    declaration: Declaration,
    gate: BorderGateConfig,
    event: GateEvent,
    access: UserAccessContext,
    prioritizeQuarantine: boolean,
  ): Promise<void> {
    if (event.direction !== GateDirection.ENTRY || event.decision !== GateDecision.ALLOW) return;

    const fullRoute = await this.routes.routeFor(declaration.type);
    const instance = await this.provisioning.ensure(declaration, fullRoute);
    // CR29 — lộ trình khớp tập bước đã đóng băng của phiên (bỏ bước Thu phí nếu cờ tắt lúc mở phiên).
    const route = effectiveRouteForInstance(fullRoute, instance);
    const stepCode = instance.currentStepCode;
    if (!stepCode || route.gateDirectionOf(stepCode) !== GateStepDirection.ENTRY) return;

    // CR2 — nút "Ưu tiên kiểm dịch": set cờ dịch tễ **nguyên tử** cùng lúc khép cổng vào, để cụm
    // nghiệp vụ mở ra chỉ có Kiểm dịch (Biên phòng/Hải quan chờ). Không có đường gỡ cờ.
    if (prioritizeQuarantine) declaration.markQuarantinePriority(event.actorId, event.occurredAt);
    const epidemic = declaration.epidemicFlag;

    const advanced = instance.completeGateStep(route, epidemic, event.actorId, event.actorName, event.occurredAt);
    if (!advanced) return;
    await this.instances.save(instance);

    // Đồng bộ hồ sơ với phiên: cột jsonb cũ + chốt vật lý + trạng thái Chờ gọi sau khi xe vào cổng và tự cấp số.
    declaration.workflowProgress[stepCode as WorkflowStepCode] = ForceStatus.COMPLETED;
    const checkpoint = workflowStepMetadata(stepCode)?.checkpoint;
    if (checkpoint) declaration.setCheckpoint(checkpoint);
    declaration.applyWorkflowStatus(DeclarationStatus.WAITING_CALL);
    const actorRole = access.roles.map((role) => role.code).join('+');
    declaration.recordOperationAction(event.actorId, actorRole, `Xe qua cổng ${gate.name}, xác nhận vào cửa khẩu.`);
    await this.declarations.save(declaration);
  }

  /**
   * F44 — xe được cho qua **cổng ra** là **đường duy nhất** đặt hồ sơ sang `EXITED` rồi `COMPLETED`:
   * khép bước cổng cuối của phiên liên ngành do chính sự kiện cổng (không qua `/workflow/.../decide`),
   * rồi lưu trữ hồ sơ. Điều kiện mở cổng (F39) đã được kiểm ở trên nên tới đây chắc chắn đủ điều kiện.
   *
   * Idempotent: hồ sơ đã rời cửa khẩu thì bỏ qua. Cổng VÀO và quyết định DENY không đụng trạng thái.
   */
  private async completeExitIfLeft(
    declaration: Declaration,
    gate: BorderGateConfig,
    event: GateEvent,
    access: UserAccessContext,
  ): Promise<void> {
    if (!event.releasesPosition) return;
    if (declaration.status === DeclarationStatus.EXITED || declaration.status === DeclarationStatus.COMPLETED) return;

    const fullRoute = await this.routes.routeFor(declaration.type);
    const instance = await this.provisioning.ensure(declaration, fullRoute);
    // CR29 — lộ trình khớp tập bước đã đóng băng của phiên (bỏ bước Thu phí nếu cờ tắt lúc mở phiên).
    const route = effectiveRouteForInstance(fullRoute, instance);
    // Điều kiện mở cổng ra bảo đảm mọi bước liên ngành trước cổng đã xong ⇒ phiên đang đứng đúng ở
    // bước cổng ra. Vẫn kiểm tường minh để chỉ khép khi đúng bước cổng ra, tránh khép nhầm bước khác.
    if (instance.currentStepCode && route.gateDirectionOf(instance.currentStepCode) === GateStepDirection.EXIT) {
      instance.completeGateStep(route, declaration.epidemicFlag, event.actorId, event.actorName, event.occurredAt);
      await this.instances.save(instance);
    }

    const actorRole = access.roles.map((role) => role.code).join('+');
    declaration.markExitedThenCompleted(event.actorId, actorRole, `Xe qua cổng ${gate.name}, đã rời cửa khẩu.`, event.occurredAt);
    await this.declarations.save(declaration);
  }

  /**
   * Báo cho doanh nghiệp mỗi lần xe được cho qua hoặc bị chặn tại cổng — bù thiếu sót C6: trước đây
   * sự kiện cổng (F38) **không phát thông báo nào**, doanh nghiệp không biết xe đã ra/vào hay chưa.
   */
  private async publishNotification(
    declaration: Declaration,
    gateName: string,
    event: GateEvent,
  ): Promise<void> {
    const allowed = event.decision === GateDecision.ALLOW;
    const hasBlocking = event.blockingReasons.length > 0;
    const plateNumber = declaration.vehicle?.plateNumber || declaration.code;
    const actorText = event.actorName ? `${event.actorName} ` : '';

    const contentKey: MessageKey = allowed
      ? 'notification.gateAllowedContent'
      : hasBlocking
        ? 'notification.gateDeniedContentWithBlocking'
        : 'notification.gateDeniedContent';

    const contentParams: MessageParams = allowed
      ? { code: declaration.code, actorText }
      : hasBlocking
        ? { code: declaration.code, gateName, reasons: event.blockingReasons.join(' ') }
        : { code: declaration.code, gateName };

    await this.notifications.publish({
      type: NotificationType.DOSSIER_STATUS_CHANGED,
      titleKey: allowed ? 'notification.gateAllowedTitle' : 'notification.gateDeniedTitle',
      titleParams: allowed ? { plateNumber } : { code: declaration.code, gateName },
      contentKey,
      contentParams,
      dossierId: declaration.id,
      dossierCode: declaration.code,
      ownerUserId: declaration.createdById,
      enterpriseTaxCode: declaration.enterprise.taxCode,
      excludeActorId: event.actorId,
    });

    if (event.direction === GateDirection.ENTRY && allowed) {
      const plateNumber = declaration.vehicle?.plateNumber || declaration.code;
      const recipientRoleCodes = declaration.epidemicFlag
        ? ['SYS_ADMIN', 'ADMIN', 'QUARANTINE', 'DISPATCHER']
        : ['DISPATCHER'];

      await this.notifications.publish({
        type: NotificationType.DOSSIER_STATUS_CHANGED,
        titleKey: 'notification.vehicleWaitingDispatchTitle',
        titleParams: { plateNumber },
        contentKey: 'notification.vehicleWaitingDispatchContent',
        contentParams: { plateNumber },
        dossierId: declaration.id,
        route: '/operations/vehicle-confirmation',
        recipientRoleCodes,
        excludeActorId: event.actorId,
      });
    }
  }

  /**
   * Xe được cho qua **cổng ra** nghĩa là đã rời khu vực cửa khẩu → nhả vị trí đang giữ (F44).
   * Không có vị trí nào đang giữ thì bỏ qua, không phải lỗi.
   */
  private async releasePositionIfLeft(event: GateEvent): Promise<void> {
    if (!event.releasesPosition) return;
    const assignment = await this.assignments.findActiveByDossier(event.dossierId);
    if (!assignment) return;
    assignment.release(event.occurredAt);
    await this.assignments.update(assignment);
  }
}
