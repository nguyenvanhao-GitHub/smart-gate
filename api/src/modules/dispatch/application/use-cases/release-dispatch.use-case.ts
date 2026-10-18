import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../../../declarations/application/ports/declaration.repository';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { DispatchAuditAction, placementSnapshot } from '../../domain/dispatch-audit-action';
import { ReleaseDispatchCommand } from '../dto/assign-dispatch.command';
import { DispatchAssignmentDetailView, toAssignmentDetailView } from '../dto/dispatch-view.dto';
import { DISPATCH_ASSIGNMENT_REPOSITORY, DispatchAssignmentRepository } from '../ports/dispatch-assignment.repository';
import { appNotFound } from '../../../../common/i18n';

/**
 * Giải phóng vị trí khi xe rời đi (F44). Bản ghi chuyển sang `RELEASED` chứ **không xoá** —
 * đó vừa là dấu vết tra cứu, vừa là cách chỉ mục duy nhất có điều kiện nhả ô đỗ ra.
 * Gọi lại lần hai trên vị trí đã giải phóng là **không lỗi** (idempotent).
 */
@Injectable()
export class ReleaseDispatchUseCase {
  constructor(
    @Inject(DISPATCH_ASSIGNMENT_REPOSITORY)
    private readonly assignments: DispatchAssignmentRepository,
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    private readonly scope: DossierScopeService,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: ReleaseDispatchCommand): Promise<DispatchAssignmentDetailView> {
    const assignment = await this.assignments.findById(command.assignmentId);
    if (!assignment) throw appNotFound('dispatch.releaseNotFound');

    const declaration = await this.declarations.findById(assignment.dossierId);
    if (declaration) this.scope.assertAccessible(declaration, command.access);

    if (!assignment.isActive) return toAssignmentDetailView(assignment);

    // Chụp vị trí trước khi giải phóng để ghi vết "từ vị trí → (bỏ)" (F33).
    const before = placementSnapshot(assignment.placement);
    assignment.release();
    const saved = await this.assignments.update(assignment);
    await this.audit.record({
      action: DispatchAuditAction.RELEASE,
      targetType: 'DECLARATION',
      targetId: assignment.dossierId,
      before: {
        code: declaration?.code,
        dossierCode: declaration?.code,
        ...before,
      },
      after: null,
    });
    return toAssignmentDetailView(saved);
  }
}
