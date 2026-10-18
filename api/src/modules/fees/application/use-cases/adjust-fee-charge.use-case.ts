import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { FEE_STEP_GATE, FeeStepGateQuery } from '../../../../common/fees/fee-step-gate.port';
import { appBadRequest, appNotFound } from '../../../../common/i18n';
import {
  DECLARATION_REPOSITORY,
  DeclarationRepository,
} from '../../../declarations/application/ports/declaration.repository';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { FeeSheetView, toFeeSheetView } from '../dto/fee-view.dto';
import { AdjustFeeChargeCommand } from '../dto/fee.command';
import { FEE_CHARGE_REPOSITORY, FeeChargeRepository } from '../ports/fee-charge.repository';
import { FEE_REASON_CODE_CATALOG, FeeReasonCodeCatalogPort } from '../ports/fee-reason-code.port';
import { FEE_TRANSACTION_REPOSITORY, FeeTransactionRepository } from '../ports/fee-transaction.repository';

/**
 * Điều chỉnh số tiền một khoản phí đã tính (F47).
 *
 * **Mã lý do là bắt buộc và phải thuộc nhóm `REASON_FEE_ADJUST`** — thiếu hoặc sai thì 400. Đây là
 * ràng buộc của SRS 7.2: mọi lần sửa số tiền phải truy được "ai sửa, vì lý do gì". Mã lý do được
 * đối chiếu với **danh mục trong database** chứ không phải danh sách cứng, vì quản trị được
 * thêm/khoá mã mà không cần deploy lại.
 */
@Injectable()
export class AdjustFeeChargeUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    @Inject(FEE_CHARGE_REPOSITORY)
    private readonly charges: FeeChargeRepository,
    @Inject(FEE_TRANSACTION_REPOSITORY)
    private readonly transactions: FeeTransactionRepository,
    @Inject(FEE_REASON_CODE_CATALOG)
    private readonly reasonCodes: FeeReasonCodeCatalogPort,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
    @Inject(FEE_STEP_GATE)
    private readonly feeStepGate: FeeStepGateQuery,
    private readonly scope: DossierScopeService,
  ) {}

  async execute(command: AdjustFeeChargeCommand): Promise<{ fees: FeeSheetView }> {
    const declaration = await this.declarations.findById(command.dossierId);
    if (!declaration) throw appNotFound('fee.dossierNotFound');
    this.scope.assertAccessible(declaration, command.access);

    const reasonCode = command.reasonCode?.trim();
    if (!reasonCode) throw appBadRequest('fee.reasonCodeRequired');
    const reason = await this.reasonCodes.findActiveAdjustReason(reasonCode);
    if (!reason) throw appBadRequest('fee.reasonCodeInvalid', { reasonCode });

    if (!Number.isFinite(command.amount) || command.amount < 0) throw appBadRequest('fee.amountInvalid');

    const charges = await this.charges.findByDossier(declaration.id);
    const charge = charges.find((item) => item.ruleCode === command.ruleCode);
    if (!charge) throw appNotFound('fee.chargeNotFound', { ruleCode: command.ruleCode });

    const before = { ruleCode: charge.ruleCode, amount: charge.amount, adjusted: charge.adjusted };
    charge.adjust(command.amount, reasonCode, command.reasonNote?.trim() || null, command.actorId);
    await this.charges.save(charge);

    await this.audit.record({
      action: 'FEE_ADJUST',
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
        ruleCode: charge.ruleCode,
        amount: charge.amount,
        reasonCode,
        reasonNote: charge.reasonNote,
      },
    });

    const [transactions, feeStepReached] = await Promise.all([
      this.transactions.findByDossier(declaration.id),
      this.feeStepGate.hasReachedFeeStep(declaration.id),
    ]);
    return { fees: toFeeSheetView(charges, transactions, feeStepReached) };
  }
}
