import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import {
  NOTIFICATION_PUBLISHER,
  NotificationPublisher,
} from '../../../../common/notifications/notification-publisher.port';
import { NotificationType } from '../../../notifications/domain/notification-type.enum';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../../../declarations/application/ports/declaration.repository';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { Declaration } from '../../../declarations/domain/declaration.entity';
import { DispatchAuditAction, placementSnapshot } from '../../domain/dispatch-audit-action';
import { DispatchAssignment, DispatchPlacement } from '../../domain/dispatch-assignment.entity';
import { describePlacement } from '../../domain/dispatch-placement.rules';
import { AssignDispatchCommand } from '../dto/assign-dispatch.command';
import { DispatchAssignmentDetailView, toAssignmentDetailView } from '../dto/dispatch-view.dto';
import {
  DISPATCH_ASSIGNMENT_REPOSITORY,
  DispatchAssignmentConflictError,
  DispatchAssignmentRepository,
} from '../ports/dispatch-assignment.repository';
import { PlacementValidatorService } from '../services/placement-validator.service';
import { appNotFound, appConflict } from '../../../../common/i18n';

/**
 * Gán vị trí cho một xe/hồ sơ (F29, F31, F43).
 *
 * Hai luật của P4 — **một xe không nằm ở hai vị trí** và **một ô đỗ không chứa hai xe** — được
 * chặn hai lớp:
 * 1. Kiểm trước ở đây để trả 409 kèm thông báo nói rõ xe nào/ô nào đang vướng.
 * 2. Chỉ mục duy nhất có điều kiện trong database, bắt được cả trường hợp hai yêu cầu chạy song
 *    song mà lớp 1 không thấy nhau. Lỗi trùng chỉ mục cũng được đổi thành 409 với cùng thông điệp.
 */
@Injectable()
export class AssignDispatchUseCase {
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

  async execute(command: AssignDispatchCommand): Promise<DispatchAssignmentDetailView> {
    const declaration = await this.declarations.findById(command.dossierId);
    if (!declaration) throw appNotFound('dispatch.dossierNotFound');
    this.scope.assertAccessible(declaration, command.access);

    const placement: DispatchPlacement = {
      gateCode: command.gateCode ?? null,
      laneCode: command.laneCode ?? null,
      yardId: command.yardId ?? null,
      slotCode: command.slotCode ?? null,
    };
    await this.placements.assertValid(placement);
    // Nhóm B — không cho gán cổng ngược chiều luồng của hồ sơ (nhập→ENTRY, xuất→EXIT).
    await this.placements.assertGateDirection(placement.gateCode, declaration.type);

    const current = await this.assignments.findActiveByDossier(command.dossierId);
    if (current) {
      throw appConflict('dispatch.vehicleAlreadyPlaced', { dossierCode: declaration.code });
    }
    await this.assertSlotFree(placement);

    const assignment = DispatchAssignment.assign({
      dossierId: command.dossierId,
      gateCode: placement.gateCode,
      laneCode: placement.laneCode,
      yardId: placement.yardId,
      slotCode: placement.slotCode,
      assignedById: command.actorId,
      note: command.note ?? null,
    });

    try {
      const saved = await this.assignments.insert(assignment);
      // Ghi vết điều phối (F33): gán vị trí mới, chưa có vị trí trước đó.
      await this.audit.record({
        action: DispatchAuditAction.ASSIGN,
        targetType: 'DECLARATION',
        targetId: declaration.id,
        before: null,
        after: {
          code: declaration.code,
          dossierCode: declaration.code,
          plateNumber: declaration.vehicle?.plateNumber,
          ...placementSnapshot(placement),
        },
      });
      await this.publishNotification(declaration, placement);
      return toAssignmentDetailView(saved);
    } catch (error) {
      throw this.toHttpConflict(error, declaration.code, placement);
    }
  }

  /**
   * Báo cho doanh nghiệp vị trí xe vừa được điều phối — bù thiếu sót C6: trước đây điều phối (F29)
   * **không phát thông báo nào**, tài xế phải tự hỏi mới biết vào cổng/làn/ô đỗ nào.
   */
  private async publishNotification(declaration: Declaration, placement: DispatchPlacement): Promise<void> {
    await this.notifications.publish({
      type: NotificationType.DOSSIER_STATUS_CHANGED,
      titleKey: 'notification.dossierAssignedTitle',
      titleParams: { code: declaration.code },
      contentKey: 'notification.dossierAssignedContent',
      contentParams: {
        code: declaration.code,
        placement: describePlacement(placement),
        ...(placement.gateCode ? { gateCode: placement.gateCode } : {}),
        ...(placement.laneCode ? { laneCode: placement.laneCode } : {}),
        ...(placement.slotCode ? { slotCode: placement.slotCode } : {}),
      },
      dossierId: declaration.id,
      dossierCode: declaration.code,
      ownerUserId: declaration.createdById,
      enterpriseTaxCode: declaration.enterprise.taxCode,
    });
  }

  private async assertSlotFree(placement: DispatchPlacement): Promise<void> {
    if (!placement.yardId || !placement.slotCode) return;
    const occupied = await this.assignments.findActiveBySlot(placement.yardId, placement.slotCode);
    if (occupied) {
      throw appConflict('dispatch.slotOccupied', { slotCode: placement.slotCode });
    }
  }

  private toHttpConflict(error: unknown, dossierCode: string, placement: DispatchPlacement): unknown {
    if (!(error instanceof DispatchAssignmentConflictError)) return error;
    return error.scope === 'SLOT'
      ? appConflict('dispatch.slotJustTaken', { slotCode: placement.slotCode })
      : appConflict('dispatch.vehicleJustMoved', { dossierCode });
  }
}
