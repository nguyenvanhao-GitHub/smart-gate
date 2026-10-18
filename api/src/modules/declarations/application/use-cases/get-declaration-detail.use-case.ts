import { Inject, Injectable } from '@nestjs/common';
import { UserAccessContext } from '../../../../common/auth/access-context';
import {
  WORKFLOW_INSTANCE_REPOSITORY,
  WorkflowInstanceRepository,
} from '../../../workflow/application/ports/workflow-instance.repository';
import { WorkflowProvisioningService } from '../../../workflow/application/services/workflow-provisioning.service';
import { WorkflowRouteService } from '../../../workflow/application/services/workflow-route.service';
import { hasReachedFeeStep } from '../../../workflow/domain/fee-step-gate.rules';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { GATE_PASSAGE_TIMES, GatePassageTimesQuery } from '../../../../common/gate/gate-passage.port';
import { Declaration } from '../../domain/declaration.entity';
import { DeclarationStatus } from '../../domain/declaration.enums';
import {
  DossierDetail,
  DossierWorkflowStep,
  toDossierDetail,
  toWorkflowHistoryViews,
  toWorkflowStepViews,
} from '../dto/dossier-view.dto';
import { DossierScopeService } from '../services/dossier-scope.service';
import { DOSSIER_ATTACHMENTS, DossierAttachmentPort } from '../ports/dossier-attachment.port';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../ports/declaration.repository';
import { appNotFound } from '../../../../common/i18n';
import { WorkflowRoute } from '../../../workflow/domain/workflow-route';

@Injectable()
export class GetDeclarationDetailUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    @Inject(DOSSIER_ATTACHMENTS)
    private readonly attachments: DossierAttachmentPort,
    @Inject(GATE_PASSAGE_TIMES)
    private readonly gatePassage: GatePassageTimesQuery,
    private readonly scope: DossierScopeService,
    // Tiến trình liên ngành THẬT của hồ sơ nằm ở phân hệ `workflow`. Nạp/mở phiên lúc cần (lazy)
    // theo đúng khuôn `GetWorkflowDossierUseCase` — không phụ thuộc `forceProgress`/`auditTrail` cũ.
    private readonly workflowRoutes: WorkflowRouteService,
    private readonly workflowProvisioning: WorkflowProvisioningService,
    @Inject(WORKFLOW_INSTANCE_REPOSITORY)
    private readonly workflowInstances: WorkflowInstanceRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(id: string, access: UserAccessContext): Promise<DossierDetail> {
    const declaration = await this.declarations.findById(id);
    if (!declaration) throw appNotFound('dossier.notFound');
    // Quyền `dossier.view` chỉ trả lời "có được xem hồ sơ nói chung không"; hồ sơ **nào** thì
    // phải hỏi tiếp phạm vi dữ liệu, nếu không thì đoán id là đọc được hồ sơ doanh nghiệp khác.
    this.scope.assertAccessible(declaration, access);

    const [attachments, workflow, passage, actions] = await Promise.all([
      this.attachments.listByDossier(declaration.id),
      this.loadWorkflow(declaration),
      // CR12 — mốc nhập/xuất cảnh đọc từ `gate_events` (không lưu cột riêng).
      this.gatePassage.timesOf(declaration.id),
      this.workflowInstances.findActionsByDossierId(declaration.id),
    ]);

    await this.audit.record({
      action: 'VIEW_DOSSIER_DETAIL',
      targetType: 'DECLARATION',
      targetId: declaration.id,
      actorId: access.userId,
      after: {
        code: declaration.code,
        dossierCode: declaration.code,
      },
    });

    const workflowHistory = toWorkflowHistoryViews(declaration, actions, workflow.route, workflow.steps);

    return toDossierDetail(
      declaration,
      attachments,
      workflow.steps,
      workflow.feeStepReached,
      passage,
      workflowHistory,
    );
  }

  /**
   * Nạp tiến trình liên ngành cho mục 6 của màn chi tiết, kèm cờ **đã tới bước thu phí** (dùng cho lối
   * vào màn thu phí UI-11). Phiên được **mở lúc cần** (idempotent) y như màn xử lý nghiệp vụ; hồ sơ chưa
   * gửi hoặc đã hủy thì chưa có phiên nên trả rỗng + `feeStepReached=false` thay vì ép mở (mở phiên cho
   * hồ sơ nháp sẽ ném lỗi theo `WorkflowProvisioningService`). Cờ dùng thẳng luật domain
   * `hasReachedFeeStep` trên chính phiên đã tải — không phụ thuộc cổng `FEE_STEP_GATE` (tránh truy vấn
   * lặp và vòng phụ thuộc mô-đun), đây là nguồn sự thật duy nhất về "đã tới bước phí".
   */
  private async loadWorkflow(
    declaration: Declaration,
  ): Promise<{ steps: DossierWorkflowStep[]; feeStepReached: boolean; route: WorkflowRoute }> {
    const route = await this.workflowRoutes.routeFor(declaration.type);
    let instance = await this.workflowInstances.findByDossierId(declaration.id);
    if (
      !instance &&
      (declaration.status === DeclarationStatus.DRAFT || declaration.status === DeclarationStatus.CANCELLED)
    ) {
      return { steps: [], feeStepReached: false, route };
    }

    if (!instance) {
      instance = await this.workflowProvisioning.ensure(declaration, route);
    }
    return { steps: toWorkflowStepViews(instance, route), feeStepReached: hasReachedFeeStep(instance), route };
  }
}
