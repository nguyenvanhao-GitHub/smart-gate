import { Inject, Injectable } from '@nestjs/common';
import { FEE_SETTLEMENT, FeeSettlementQuery } from '../../../common/fees/fee-settlement.port';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../../declarations/application/ports/declaration.repository';
import { GateEvaluation, WorkflowPolicyService } from '../../declarations/application/workflow-policy.service';
import { appNotFound } from '../../../common/i18n';

@Injectable()
export class SmartGateRuleService {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    private readonly workflow: WorkflowPolicyService,
    @Inject(FEE_SETTLEMENT)
    private readonly settlements: FeeSettlementQuery,
  ) {}

  getOpenGateRules() {
    return [
      { checkpoint: 'B2_IN_EXPORT', rule: 'Ho so hop le, QR/bien so khop, xe dung chot dau vao.' },
      { checkpoint: 'B1_EXPORT_EXIT', rule: 'Hải quan + Kiểm dịch bắt buộc + Biên phòng + Phí đã hoàn thành.' },
      { checkpoint: 'B1_IMPORT_ENTRY', rule: 'Xe nhap canh hop le, ghi nhan vao lanh tho va kich hoat khu trung neu ap dung.' },
      { checkpoint: 'B2_IMPORT_EXIT', rule: 'Biên phòng + Kiểm dịch bắt buộc + Hải quan + Phí đã hoàn thành.' },
    ];
  }

  /** F39 — cùng một nguồn sự thật với màn hình cổng: nghĩa vụ tài chính đọc qua `FEE_SETTLEMENT`. */
  async evaluateDeclaration(id: string, gate?: GateEvaluation['gate']) {
    const declaration = await this.declarations.findById(id);
    if (!declaration) throw appNotFound('dossier.notFound');
    const settlement = await this.settlements.snapshotOf(declaration.id);
    return this.workflow.evaluateGate(
      declaration,
      gate || this.workflow.gateForDeclaration(declaration),
      settlement,
    );
  }
}
