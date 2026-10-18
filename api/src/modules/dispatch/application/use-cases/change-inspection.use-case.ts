import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../../../declarations/application/ports/declaration.repository';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { InspectionTransitionError } from '../../domain/inspection-status.rules';
import { ChangeInspectionCommand } from '../dto/assign-dispatch.command';
import { DispatchAssignmentDetailView, toAssignmentDetailView } from '../dto/dispatch-view.dto';
import { DISPATCH_ASSIGNMENT_REPOSITORY, DispatchAssignmentRepository } from '../ports/dispatch-assignment.repository';
import { appConflict, appNotFound } from '../../../../common/i18n';

/**
 * Cập nhật trạng thái kiểm tra/tập kết của xe đang đỗ (F44).
 *
 * Chuyển bước theo quy tắc trong `domain/inspection-status.rules.ts`; sai thứ tự → **409** (chặn ở
 * API, không chỉ ẩn nút). Mỗi lần chuyển **ghi lịch sử** vào nhật ký kiểm toán (F05): ai, khi nào,
 * từ→đến, ghi chú — nhất quán với cách P2/P3 lưu vết thay đổi qua `AUDIT_LOGGER`.
 */
@Injectable()
export class ChangeInspectionUseCase {
  constructor(
    @Inject(DISPATCH_ASSIGNMENT_REPOSITORY)
    private readonly assignments: DispatchAssignmentRepository,
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    private readonly scope: DossierScopeService,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: ChangeInspectionCommand): Promise<DispatchAssignmentDetailView> {
    const assignment = await this.assignments.findById(command.assignmentId);
    if (!assignment) throw appNotFound('dispatch.assignmentNotFound');

    const declaration = await this.declarations.findById(assignment.dossierId);
    if (declaration) this.scope.assertAccessible(declaration, command.access);

    if (!assignment.isActive) throw appConflict('dispatch.inspectionNotActive');

    const from = assignment.inspectionStatus;
    try {
      assignment.changeInspection(command.status);
    } catch (error) {
      if (error instanceof InspectionTransitionError) {
        throw appConflict('dispatch.inspectionInvalidTransition', { from: error.from, to: error.to });
      }
      throw error;
    }

    const saved = await this.assignments.update(assignment);
    await this.audit.record({
      action: 'DISPATCH_INSPECTION_CHANGED',
      targetType: 'DISPATCH_ASSIGNMENT',
      targetId: saved.id,
      before: {
        code: declaration?.code,
        dossierCode: declaration?.code,
        inspectionStatus: from,
      },
      after: {
        code: declaration?.code,
        dossierCode: declaration?.code,
        inspectionStatus: saved.inspectionStatus,
        note: command.note ?? null,
      },
    });
    return toAssignmentDetailView(saved);
  }
}
