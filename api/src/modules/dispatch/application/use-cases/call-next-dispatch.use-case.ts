import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import {
  NOTIFICATION_PUBLISHER,
  NotificationPublisher,
} from '../../../../common/notifications/notification-publisher.port';
import { NotificationType } from '../../../notifications/domain/notification-type.enum';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../../../declarations/application/ports/declaration.repository';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { DeclarationStatus } from '../../../declarations/domain/declaration.enums';
import { INSPECTION_STEP_CODES } from '../../../declarations/domain/workflow-step.catalog';
import { formatTicketCode, toIssuedDate } from '../../../queue/domain/queue-ticket.entity';
import { WorkflowStage, currentStageFromOpenSteps } from '../../../workflow/domain/workflow-route';
import { CallNextDispatchCommand, CallNextDispatchResult } from '../dto/call-next-dispatch.command';
import {
  DISPATCH_ASSIGNMENT_REPOSITORY,
  DispatchAssignmentRepository,
  DispatchBoardRow,
} from '../ports/dispatch-assignment.repository';
import { appNotFound } from '../../../../common/i18n';

/**
 * Gọi số tiếp theo vào kiểm tra chuyên ngành (UI-08 · SG-60 · Điều phối bãi).
 *
 * Nghiệp vụ:
 * 1. Lấy danh sách phương tiện đang trong giai đoạn chờ điều phối (cột WAITING / trạng thái WAITING_CALL / WAITING_GATE).
 * 2. Chọn phương tiện có số thứ tự nhỏ nhất (FIFO) trong ngày làm việc (hoặc gọi đích danh nếu có dossierId).
 * 3. Chuyển trạng thái hồ sơ sang BUSINESS_PROCESSING (Đang xử lý nghiệp vụ).
 * 4. Ghi nhật ký kiểm toán và phát thông báo gọi xe tới doanh nghiệp / tài xế.
 */
@Injectable()
export class CallNextDispatchUseCase {
  constructor(
    @Inject(DISPATCH_ASSIGNMENT_REPOSITORY)
    private readonly assignments: DispatchAssignmentRepository,
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly scope: DossierScopeService,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
    @Inject(NOTIFICATION_PUBLISHER)
    private readonly notifications: NotificationPublisher,
  ) {}

  async execute(command: CallNextDispatchCommand): Promise<CallNextDispatchResult> {
    const scope = this.scope.toCriteria(command.access);
    const date = command.date || toIssuedDate(new Date());

    const rows = await this.assignments.findBoard({
      checkpoint: command.checkpoint,
      date,
      from: command.from,
      to: command.to,
      unrestricted: scope.unrestricted,
      ownerUserId: scope.ownerUserId,
      taxCodes: scope.taxCodes,
    });

    let targetRow: DispatchBoardRow | undefined;

    if (command.dossierId) {
      targetRow = rows.find((r) => r.dossierId === command.dossierId);
      if (!targetRow) {
        const directDossier = await this.declarations.findById(command.dossierId);
        if (!directDossier) throw appNotFound('dispatch.dossierNotFound');
        this.scope.assertAccessible(directDossier, command.access);
        targetRow = {
          dossierId: directDossier.id,
          dossierCode: directDossier.code,
          plateNumber: directDossier.vehicle.plateNumber || '',
          enterpriseName: directDossier.enterprise.name || '',
          dossierStatus: directDossier.status,
          dossierType: directDossier.type,
          ticketNumber: null,
          ticketIssuedDate: null,
          waitingSince: directDossier.createdAt,
          currentStepCode: null,
          activeStepCodes: [],
          assignment: null,
        };
      }
    } else {
      // Lọc các xe đang ở giai đoạn chờ điều phối / cổng vào / WAITING_CALL
      const waitingRows = rows.filter((row) => {
        const stage = currentStageFromOpenSteps(row.activeStepCodes);
        const isWaitingStage = stage === WorkflowStage.ENTRY_GATE;
        const isWaitingStatus =
          row.dossierStatus === DeclarationStatus.WAITING_CALL ||
          row.dossierStatus === DeclarationStatus.WAITING_GATE;
        return isWaitingStage || isWaitingStatus;
      });

      if (!waitingRows.length) {
        return { called: false, message: 'dispatch.noWaitingVehicles' };
      }

      // Sắp xếp theo số thứ tự tăng dần (FIFO), số nào trước gọi trước
      waitingRows.sort((a, b) => {
        if (a.ticketNumber !== null && b.ticketNumber !== null) {
          return a.ticketNumber - b.ticketNumber;
        }
        if (a.ticketNumber !== null) return -1;
        if (b.ticketNumber !== null) return 1;
        return a.waitingSince.getTime() - b.waitingSince.getTime();
      });

      targetRow = waitingRows[0];
    }

    const declaration = await this.declarations.findById(targetRow.dossierId);
    if (!declaration) throw appNotFound('dispatch.dossierNotFound');
    this.scope.assertAccessible(declaration, command.access);

    const fromStatus = declaration.status;
    declaration.applyWorkflowStatus(DeclarationStatus.BUSINESS_PROCESSING);
    await this.declarations.save(declaration);

    const callTime = new Date();
    await this.dataSource.query(
      `UPDATE "workflow_instance_steps" s
       SET "entered_at" = COALESCE(s."entered_at", $1),
           "status" = CASE WHEN s."status" = 'PENDING' THEN 'IN_PROGRESS' ELSE s."status" END
       FROM "workflow_instances" wi
       WHERE s."instance_id" = wi."id"
         AND wi."dossier_id" = $2
         AND s."step_code" = ANY($3)
         AND s."status" NOT IN ('COMPLETED', 'REJECTED')`,
      [callTime, declaration.id, INSPECTION_STEP_CODES],
    );

    await this.dataSource.query(
      `UPDATE "workflow_instance_steps" s
       SET "status" = 'COMPLETED',
           "completed_at" = COALESCE(s."completed_at", $1)
       FROM "workflow_instances" wi
       WHERE s."instance_id" = wi."id"
         AND wi."dossier_id" = $2
         AND s."status" = 'IN_PROGRESS'
         AND NOT (s."step_code" = ANY($3))`,
      [callTime, declaration.id, INSPECTION_STEP_CODES],
    );

    const ticketCode =
      targetRow.ticketNumber !== null
        ? formatTicketCode(targetRow.ticketIssuedDate ?? targetRow.waitingSince ?? new Date(), targetRow.ticketNumber)
        : null;

    // Ghi vết kiểm toán
    await this.audit.record({
      action: 'DISPATCH_CALL_NEXT',
      targetType: 'DECLARATION',
      targetId: declaration.id,
      before: {
        code: declaration.code,
        dossierCode: declaration.code,
        status: fromStatus,
      },
      after: {
        code: declaration.code,
        dossierCode: declaration.code,
        status: DeclarationStatus.BUSINESS_PROCESSING,
        ticketNumber: targetRow.ticketNumber,
        ticketCode,
        plateNumber: targetRow.plateNumber,
        actorId: command.actorId,
      },
    });

    // Phát thông báo cho người khai báo (doanh nghiệp / cá nhân) và các bộ phận quản lý (admin, bp, hq, kd)
    const plateNumber = targetRow.plateNumber || declaration.vehicle?.plateNumber || declaration.code;
    const recipientRoleCodes = declaration.epidemicFlag
      ? ['SYS_ADMIN', 'ADMIN', 'QUARANTINE']
      : ['SYS_ADMIN', 'ADMIN', 'BORDER_GUARD', 'CUSTOMS', 'QUARANTINE'];

    await this.notifications.publish({
      type: NotificationType.DOSSIER_STATUS_CHANGED,
      titleKey: 'notification.vehicleInspectionTitle',
      titleParams: { plateNumber },
      contentKey: ticketCode
        ? 'notification.vehicleInspectionContentWithTicket'
        : 'notification.vehicleInspectionContentNoTicket',
      contentParams: { plateNumber, ticketCode: ticketCode ?? '' },
      dossierId: declaration.id,
      dossierCode: declaration.code,
      ownerUserId: declaration.createdById,
      route: `/workflow/dossiers/${declaration.id}`,
      recipientRoleCodes,
    });

    return {
      called: true,
      dossierId: declaration.id,
      dossierCode: declaration.code,
      plateNumber: targetRow.plateNumber,
      ticketNumber: targetRow.ticketNumber,
      ticketCode,
      enterpriseName: targetRow.enterpriseName,
    };
  }
}
