import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { FEE_CALCULATOR, DossierFeeCalculator } from '../../../../common/fees/fee-calculator.port';
import { FEE_SETTLEMENT, FeeSettlementQuery } from '../../../../common/fees/fee-settlement.port';
import { appBadRequest, appConflict, appForbidden, appNotFound, MessageKey } from '../../../../common/i18n';
import {
  NOTIFICATION_PUBLISHER,
  NotificationPublisher,
} from '../../../../common/notifications/notification-publisher.port';
import { UserAccessContext } from '../../../../common/auth/access-context';
import {
  DECLARATION_REPOSITORY,
  DeclarationRepository,
} from '../../../declarations/application/ports/declaration.repository';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { Declaration } from '../../../declarations/domain/declaration.entity';
import { ForceStatus, WorkflowStepCode } from '../../../declarations/domain/declaration.enums';
import { isInspectionStep, workflowStepMetadata } from '../../../declarations/domain/workflow-step.catalog';
import { NotificationType } from '../../../notifications/domain/notification-type.enum';
import { AgencyAction } from '../../domain/agency-action.entity';
import { effectiveRouteForInstance, hasReachedFeeStep } from '../../domain/fee-step-gate.rules';
import {
  ReasonRuleMessage,
  invalidReasonCodeMessage,
  missingReasonCodeMessage,
  missingReasonNoteMessage,
  reasonScopeFor,
  requiresReasonCode,
  requiresReasonNote,
} from '../../domain/reason-code.rules';
import { StepOrderViolation, checkStepAction } from '../../domain/workflow-order.rules';
import { dossierStatusFor } from '../../domain/workflow-status.rules';
import { WorkflowInstance } from '../../domain/workflow-instance.entity';
import { WorkflowRoute } from '../../domain/workflow-route';
import { WorkflowDecision, advancesToNextStep } from '../../domain/workflow.enums';
import { DecideWorkflowStepCommand } from '../dto/decide-workflow-step.command';
import { WorkflowInstanceView, toWorkflowInstanceView } from '../dto/workflow-view.dto';
import { REASON_CODE_CATALOG, ReasonCodeCatalogPort } from '../ports/reason-code.port';
import { WORKFLOW_ACTOR_DIRECTORY, WorkflowActorDirectory } from '../ports/workflow-actor.port';
import {
  WORKFLOW_CHECKLIST_CATALOG,
  WORKFLOW_CHECKLIST_REPOSITORY,
  WorkflowChecklistCatalog,
  WorkflowChecklistRepository,
} from '../ports/workflow-checklist.port';
import {
  WORKFLOW_INSTANCE_REPOSITORY,
  WorkflowInstanceRepository,
} from '../ports/workflow-instance.repository';
import { WorkflowProvisioningService } from '../services/workflow-provisioning.service';
import { WorkflowRouteService } from '../services/workflow-route.service';

/**
 * Ghi quyết định của lực lượng chuyên ngành lên bước hiện tại (F18–F26, DoD mốc M2).
 *
 * Thứ tự kiểm tra — cố ý theo đúng trình tự này để thông báo lỗi chỉ đúng nguyên nhân gốc:
 * 1. hồ sơ có tồn tại và người dùng có được đụng vào không (404/403);
 * 2. **đúng thứ tự bước** theo lộ trình đọc từ `workflow_step_roles` → sai thì **409**, kể cả khi
 *    người gọi bấm thẳng vào API chứ không qua giao diện; bước cổng (vào/ra) do sự kiện cổng khép
 *    nên không quyết định được ở đây (→ 409);
 * 3. đúng vai trò của bước (403) và đúng quyền cho loại quyết định (403);
 * 4. mã nguyên nhân bắt buộc với "yêu cầu sửa đổi, bổ sung" và "từ chối" (400).
 *
 * Ba quyết định (CR36): APPROVE = "Xác nhận hoàn thành", REQUEST_SUPPLEMENT, REJECT.
 */
@Injectable()
export class DecideWorkflowStepUseCase {
  private readonly logger = new Logger(DecideWorkflowStepUseCase.name);

  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    @Inject(WORKFLOW_INSTANCE_REPOSITORY)
    private readonly instances: WorkflowInstanceRepository,
    @Inject(WORKFLOW_CHECKLIST_REPOSITORY)
    private readonly checklists: WorkflowChecklistRepository,
    @Inject(WORKFLOW_CHECKLIST_CATALOG)
    private readonly checklistCatalog: WorkflowChecklistCatalog,
    @Inject(REASON_CODE_CATALOG)
    private readonly reasonCodes: ReasonCodeCatalogPort,
    @Inject(WORKFLOW_ACTOR_DIRECTORY)
    private readonly actors: WorkflowActorDirectory,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
    @Inject(NOTIFICATION_PUBLISHER)
    private readonly notifications: NotificationPublisher,
    @Inject(FEE_SETTLEMENT)
    private readonly settlements: FeeSettlementQuery,
    @Inject(FEE_CALCULATOR)
    private readonly feeCalculator: DossierFeeCalculator,
    private readonly scope: DossierScopeService,
    private readonly routes: WorkflowRouteService,
    private readonly provisioning: WorkflowProvisioningService,
  ) {}

  async execute(command: DecideWorkflowStepCommand): Promise<{ instance: WorkflowInstanceView }> {
    const declaration = await this.declarations.findById(command.dossierId);
    if (!declaration) throw appNotFound('dossier.notFound');
    this.scope.assertAccessible(declaration, command.access);

    const fullRoute = await this.routes.routeFor(declaration.type);
    const instance = await this.provisioning.ensure(declaration, fullRoute);
    // CR29 — dùng lộ trình khớp với tập bước đã đóng băng của phiên (phiên mở lúc cờ Thu phí tắt thì
    // không có bước phí; lộ trình dựng lại từ DB phải cắt bước phí để tiến trình/điều kiện nhất quán).
    const route = effectiveRouteForInstance(fullRoute, instance);

    const roleCodes = command.access.roles.map((role) => role.code);
    // CR2 — cờ ưu tiên kiểm dịch của hồ sơ quyết định thứ tự trong cụm nghiệp vụ (Kiểm dịch tiên quyết).
    const epidemic = declaration.epidemicFlag;
    const violation = checkStepAction(route, instance, command.stepCode, roleCodes, epidemic, declaration.status);
    if (violation) throw this.toException(violation);

    this.assertDecisionPermission(command.decision, command.access);
    await this.assertReason(command.decision, command.reasonCode, command.reasonNote);
    await this.assertFeeSettled(route, command);

    if (command.checklist?.length) {
      // Defense-in-depth: dù người gọi đúng là lực lượng của bước hiện tại, vẫn chỉ ghi các mục
      // checklist **thuộc lực lượng của bước đang xử lý** — tránh việc bắn thẳng API để chèn mục
      // của lực lượng khác. Mục lạ bị bỏ qua âm thầm, không làm hỏng cả thao tác.
      const stepAgencyCode = route.find(command.stepCode)?.agencyCode ?? '';
      const definitions = await this.checklistCatalog.listDefinitions();
      const allowedCodes = new Set(
        definitions.filter((def) => def.agencyCode === stepAgencyCode).map((def) => def.code),
      );
      const scoped = command.checklist.filter((item) => allowedCodes.has(item.code));
      if (scoped.length) {
        await this.checklists.upsertStates(
          declaration.id,
          command.actorId,
          scoped.map((item) => ({ code: item.code, checked: item.checked, note: item.note ?? null })),
        );
      }
    }

    const at = new Date();
    const actor = await this.actors.findById(command.actorId);
    const elapsedSeconds = instance.step(command.stepCode)?.elapsedSeconds(at) ?? 0;
    const before = { status: declaration.status, instanceStatus: instance.status, step: instance.currentStepCode };
    // Chụp tiến độ bước phí **trước** khi áp quyết định để nhận biết đúng lúc "vừa tới bước thu phí".
    const reachedFeeStepBefore = hasReachedFeeStep(instance);

    instance.applyDecision(
      {
        stepCode: command.stepCode,
        decision: command.decision,
        actorId: command.actorId,
        actorName: actor?.fullName ?? null,
        reasonCode: command.reasonCode ?? null,
        reasonNote: command.reasonNote ?? null,
        at,
      },
      route,
      epidemic,
    );

    const saved = await this.instances.save(instance);
    await this.instances.appendAction(
      AgencyAction.create({
        dossierId: declaration.id,
        instanceId: saved.id,
        stepCode: command.stepCode,
        agencyCode: route.find(command.stepCode)?.agencyCode ?? '',
        actorId: command.actorId,
        actorName: actor?.fullName ?? null,
        decision: command.decision,
        reasonCode: command.reasonCode ?? null,
        reasonNote: command.reasonNote ?? null,
        elapsedSeconds,
        actedAt: at,
      }),
    );

    this.syncDeclaration(declaration, saved, route, command);
    const savedDeclaration = await this.declarations.save(declaration);

    await this.audit.record({
      action: 'WORKFLOW_DECIDE',
      targetType: 'DECLARATION',
      targetId: declaration.id,
      before: {
        code: declaration.code,
        dossierCode: declaration.code,
        ...before,
      },
      after: {
        code: savedDeclaration.code,
        dossierCode: savedDeclaration.code,
        status: savedDeclaration.status,
        instanceStatus: saved.status,
        step: command.stepCode,
        decision: command.decision,
        reasonCode: command.reasonCode ?? null,
        reasonNote: command.reasonNote ?? null,
        elapsedSeconds,
      },
    });
    await this.publishNotification(savedDeclaration, command, saved, route);
    await this.autoCalculateFeesOnReachingFeeStep(declaration.id, reachedFeeStepBefore, saved);

    return { instance: toWorkflowInstanceView(saved, route, at) };
  }

  /**
   * Hồ sơ **vừa tới bước thu phí** thì tự tính phí để hiện đúng số tiền + nút thu ngay (quyết định
   * chủ dự án), không chờ cán bộ bấm "Tính lại phí". Idempotent ở tầng cổng: hồ sơ đã có khoản phí thì
   * không tính lại.
   *
   * **Best-effort — KHÔNG chặn workflow**: quyết định bước đã lưu xong ở trên; nếu tính phí lỗi thì chỉ
   * ghi log và nuốt lỗi, hồ sơ vẫn tiến (nút "Tính lại phí" thủ công là phương án dự phòng).
   */
  private async autoCalculateFeesOnReachingFeeStep(
    dossierId: string,
    reachedBefore: boolean,
    instance: WorkflowInstance,
  ): Promise<void> {
    if (reachedBefore || !hasReachedFeeStep(instance)) return;
    try {
      await this.feeCalculator.ensureCalculated(dossierId);
    } catch (error) {
      this.logger.warn(
        `Không tự tính được phí cho hồ sơ ${dossierId} khi tới bước thu phí (quyết định vẫn được ghi): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Đồng bộ hồ sơ với phiên: trạng thái, chốt và cột `workflowProgress` (jsonb) còn giữ song song. */
  private syncDeclaration(
    declaration: Declaration,
    instance: WorkflowInstance,
    route: WorkflowRoute,
    command: DecideWorkflowStepCommand,
  ): void {
    if (advancesToNextStep(command.decision)) {
      declaration.workflowProgress[command.stepCode as WorkflowStepCode] = ForceStatus.COMPLETED;
      const checkpoint = workflowStepMetadata(command.stepCode)?.checkpoint;
      if (checkpoint) declaration.setCheckpoint(checkpoint);
    }
    declaration.applyWorkflowStatus(dossierStatusFor(instance, route));
    declaration.recordOperationAction(
      command.actorId,
      command.actorRole,
      `${command.decision} tại bước ${command.stepCode}${command.reasonCode ? ` (mã lý do ${command.reasonCode})` : ''}`,
    );
  }

  private assertDecisionPermission(decision: WorkflowDecision, access: UserAccessContext): void {
    const canApprove = access.permissions.includes('workflow.approve');
    if (decision === WorkflowDecision.REQUEST_SUPPLEMENT) {
      if (canApprove || access.permissions.includes('workflow.update')) return;
      throw appForbidden('workflow.forbiddenSupplement');
    }
    if (!canApprove) {
      throw appForbidden('workflow.forbiddenDecide');
    }
  }

  /**
   * CR37 — **nội dung lý do (ghi chú) bắt buộc** với "yêu cầu sửa đổi, bổ sung" và "từ chối"; **mã lý
   * do KHÔNG bắt buộc**. Nếu người xử lý vẫn chọn mã lý do thì phải là mã hợp lệ đúng nhóm.
   */
  private async assertReason(decision: WorkflowDecision, reasonCode?: string, reasonNote?: string): Promise<void> {
    if (requiresReasonNote(decision) && !reasonNote?.trim()) {
      throw this.toBadRequest(missingReasonNoteMessage(decision));
    }

    const trimmed = reasonCode?.trim();
    if (requiresReasonCode(decision) && !trimmed) {
      throw this.toBadRequest(missingReasonCodeMessage(decision));
    }
    if (!trimmed) return;

    const scope = reasonScopeFor(decision);
    if (!scope) return;
    const found = await this.reasonCodes.findActive(scope, trimmed);
    if (!found) throw this.toBadRequest(invalidReasonCodeMessage(trimmed));
  }

  /**
   * Bước thu phí (F48): cơ quan thu phí chỉ được **DUYỆT / CHUYỂN TIẾP** khi nghĩa vụ tài chính của
   * hồ sơ đã hoàn tất. Điều kiện tài chính có **một nguồn sự thật duy nhất** là `settlement` (tổng
   * giao dịch đã xác nhận so với tổng phải thu) đọc qua cổng `FEE_SETTLEMENT` — KHÔNG phải cột phí
   * `forceProgress` cũ. Chưa thu đủ → 409, người nộp phải hoàn tất thanh toán trước.
   *
   * Yêu cầu bổ sung / từ chối ở bước phí **không** bị chặn bởi điều kiện này — chỉ quyết định đẩy hồ
   * sơ sang bước sau (`APPROVE`) mới cần tiền đã vào.
   */
  private async assertFeeSettled(route: WorkflowRoute, command: DecideWorkflowStepCommand): Promise<void> {
    if (!route.isFeeStep(command.stepCode) || !advancesToNextStep(command.decision)) return;
    const settlement = await this.settlements.snapshotOf(command.dossierId);
    if (!settlement.settled) {
      throw appConflict('fee.notSettled', {
        outstanding: settlement.outstanding,
        currency: settlement.currency,
      });
    }
  }

  private toBadRequest(rule: ReasonRuleMessage): Error {
    return appBadRequest(rule.messageKey, rule.messageParams);
  }

  private toException(violation: StepOrderViolation): Error {
    switch (violation.kind) {
      case 'UNKNOWN_STEP':
        return appBadRequest(violation.messageKey, violation.messageParams);
      case 'ROLE_NOT_ALLOWED':
        return appForbidden(violation.messageKey, violation.messageParams);
      default:
        // Sai thứ tự / bước đã chốt / phiên đã đóng / bước cổng đều là xung đột trạng thái → 409.
        return appConflict(violation.messageKey, violation.messageParams);
    }
  }

  private async publishNotification(
    declaration: Declaration,
    command: DecideWorkflowStepCommand,
    instance: WorkflowInstance,
    route: WorkflowRoute,
  ): Promise<void> {
    const type =
      command.decision === WorkflowDecision.REJECT
        ? NotificationType.DOSSIER_REJECTED
        : command.decision === WorkflowDecision.REQUEST_SUPPLEMENT
          ? NotificationType.DOSSIER_SUPPLEMENT_REQUESTED
          : NotificationType.DOSSIER_STEP_CONFIRMED;

    const meta = workflowStepMetadata(command.stepCode);
    const agencyKey: MessageKey = meta?.agencyCode
      ? (`workflow.agency.${meta.agencyCode}` as MessageKey)
      : 'workflow.agency.DEFAULT';
    const hasNote = !!command.reasonNote?.trim();

    let titleKey: MessageKey;
    let contentKey: MessageKey;

    if (command.decision === WorkflowDecision.REQUEST_SUPPLEMENT) {
      titleKey = 'notification.workflowSupplementTitle';
      contentKey = hasNote
        ? 'notification.workflowSupplementContentWithNote'
        : 'notification.workflowSupplementContent';
    } else if (command.decision === WorkflowDecision.REJECT) {
      titleKey = 'notification.workflowRejectedTitle';
      contentKey = hasNote
        ? 'notification.workflowRejectedContentWithNote'
        : 'notification.workflowRejectedContent';
    } else {
      titleKey = 'notification.workflowApprovedTitle';
      contentKey = hasNote
        ? 'notification.workflowApprovedContentWithNote'
        : 'notification.workflowApprovedContent';
    }

    // 1. Thông báo cho chủ hồ sơ / doanh nghiệp (và Admin khi bị từ chối)
    await this.notifications.publish({
      type,
      titleKey,
      titleParams: { code: declaration.code, agency: agencyKey },
      contentKey,
      contentParams: {
        code: declaration.code,
        agency: agencyKey,
        ...(hasNote ? { note: command.reasonNote?.trim() } : {}),
      },
      dossierId: declaration.id,
      dossierCode: declaration.code,
      route: `/declarations/${declaration.id}`,
      ownerUserId: declaration.createdById,
      enterpriseTaxCode: declaration.enterprise.taxCode,
      recipientRoleCodes: command.decision === WorkflowDecision.REJECT ? ['SYS_ADMIN', 'ADMIN'] : undefined,
    });

    // 2. SG-110: Khi duyệt thành công (APPROVE), gửi thông báo cho tài khoản/lực lượng phụ trách bước tiếp theo
    if (command.decision === WorkflowDecision.APPROVE && instance.activeStepCodes.length > 0) {
      for (const nextStep of instance.activeStepCodes) {
        const isFeeStep = route.isFeeStep(nextStep);
        const meta = workflowStepMetadata(nextStep);
        const stepName = meta?.name ?? nextStep;
        const inspection = isInspectionStep(nextStep);

        const targetRoute = isFeeStep
          ? `/declarations/${declaration.id}/fees`
          : inspection
            ? `/workflow/dossiers/${declaration.id}`
            : `/declarations/${declaration.id}`;

        const recipientRoleCodes = isFeeStep
          ? ['FEE_COLLECTOR']
          : meta?.agencyCode
            ? [meta.agencyCode]
            : undefined;

        await this.notifications.publish({
          type: NotificationType.DOSSIER_TURN_PROCESSING,
          titleKey: 'notification.dossierTurnProcessingTitle',
          titleParams: { code: declaration.code },
          contentKey: isFeeStep
            ? 'notification.dossierTurnProcessingFeeContent'
            : 'notification.dossierTurnProcessingStepContent',
          contentParams: isFeeStep
            ? { code: declaration.code }
            : { code: declaration.code, stepName },
          dossierId: declaration.id,
          dossierCode: declaration.code,
          route: targetRoute,
          stepCodes: [nextStep],
          recipientRoleCodes,
        });
      }
    }
  }
}
