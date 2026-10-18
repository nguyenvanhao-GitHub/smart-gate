import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import {
  NOTIFICATION_PUBLISHER,
  NotificationPublisher,
} from '../../../../common/notifications/notification-publisher.port';
import { NotificationType } from '../../../notifications/domain/notification-type.enum';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../../../declarations/application/ports/declaration.repository';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { DispatchAuditAction, placementSnapshot } from '../../domain/dispatch-audit-action';
import { describePlacement, isSameSlot, mergePlacement } from '../../domain/dispatch-placement.rules';
import { MoveDispatchCommand } from '../dto/assign-dispatch.command';
import { DispatchAssignmentDetailView, toAssignmentDetailView } from '../dto/dispatch-view.dto';
import {
  DISPATCH_ASSIGNMENT_REPOSITORY,
  DispatchAssignmentConflictError,
  DispatchAssignmentRepository,
} from '../ports/dispatch-assignment.repository';
import { PlacementValidatorService } from '../services/placement-validator.service';
import { appBadRequest, appNotFound, appConflict } from '../../../../common/i18n';

/** Chuyển vị trí của một xe đang được điều phối (F31, F43). */
@Injectable()
export class MoveDispatchUseCase {
  constructor(
    @Inject(DISPATCH_ASSIGNMENT_REPOSITORY)
    private readonly assignments: DispatchAssignmentRepository,
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    private readonly scope: DossierScopeService,
    private readonly placements: PlacementValidatorService,
    @Inject(NOTIFICATION_PUBLISHER)
    private readonly notifications: NotificationPublisher,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: MoveDispatchCommand): Promise<DispatchAssignmentDetailView> {
    const assignment = await this.assignments.findById(command.assignmentId);
    if (!assignment) throw appNotFound('dispatch.assignmentNotFound');
    if (!assignment.isActive) throw appBadRequest('dispatch.assignmentReleased');

    const declaration = await this.declarations.findById(assignment.dossierId);
    if (!declaration) throw appNotFound('dispatch.assignmentDossierNotFound');
    this.scope.assertAccessible(declaration, command.access);

    const target = mergePlacement(assignment.placement, {
      gateCode: command.gateCode,
      laneCode: command.laneCode,
      yardId: command.yardId,
      slotCode: command.slotCode,
    });
    await this.placements.assertValid(target);
    // Nhóm B — chuyển vị trí cũng không được sang cổng ngược chiều luồng của hồ sơ.
    await this.placements.assertGateDirection(target.gateCode, declaration.type);

    // Chuyển sang đúng ô đang đứng thì không phải kiểm trùng — nếu không, xe sẽ tự chặn chính nó.
    if (!isSameSlot(assignment.placement, target) && target.yardId && target.slotCode) {
      const occupied = await this.assignments.findActiveBySlot(target.yardId, target.slotCode);
      if (occupied && occupied.id !== assignment.id) {
        throw appConflict('dispatch.slotOccupied', { slotCode: target.slotCode });
      }
    }

    // Chụp vị trí cũ trước khi chuyển để ghi vết "từ → đến" (F33).
    const before = placementSnapshot(assignment.placement);
    assignment.moveTo(target);
    try {
      const saved = await this.assignments.update(assignment);
      await this.audit.record({
        action: DispatchAuditAction.MOVE,
        targetType: 'DECLARATION',
        targetId: declaration.id,
        before: {
          code: declaration.code,
          dossierCode: declaration.code,
          ...before,
        },
        after: {
          code: declaration.code,
          dossierCode: declaration.code,
          plateNumber: declaration.vehicle?.plateNumber,
          ...placementSnapshot(saved.placement),
        },
      });
      // Bù thiếu sót C6: đổi vị trí cũng phải báo cho doanh nghiệp, không chỉ lần gán đầu tiên.
      await this.notifications.publish({
        type: NotificationType.DOSSIER_STATUS_CHANGED,
        titleKey: 'notification.dossierMovedTitle',
        titleParams: { code: declaration.code },
        contentKey: 'notification.dossierMovedContent',
        contentParams: {
          code: declaration.code,
          placement: describePlacement(target),
          ...(target.gateCode ? { gateCode: target.gateCode } : {}),
          ...(target.laneCode ? { laneCode: target.laneCode } : {}),
          ...(target.slotCode ? { slotCode: target.slotCode } : {}),
        },
        dossierId: declaration.id,
        dossierCode: declaration.code,
        ownerUserId: declaration.createdById,
        enterpriseTaxCode: declaration.enterprise.taxCode,
      });
      return toAssignmentDetailView(saved);
    } catch (error) {
      if (error instanceof DispatchAssignmentConflictError) {
        throw error.scope === 'SLOT'
          ? appConflict('dispatch.slotJustTaken', { slotCode: target.slotCode })
          : appConflict('dispatch.vehicleJustMoved', { dossierCode: declaration.code });
      }
      throw error;
    }
  }
}
