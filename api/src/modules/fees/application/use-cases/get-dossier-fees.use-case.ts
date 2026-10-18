import { Inject, Injectable } from '@nestjs/common';
import { FEE_STEP_GATE, FeeStepGateQuery } from '../../../../common/fees/fee-step-gate.port';
import { appNotFound } from '../../../../common/i18n';
import {
  DECLARATION_REPOSITORY,
  DeclarationRepository,
} from '../../../declarations/application/ports/declaration.repository';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { FeeSheetView, toFeeSheetView } from '../dto/fee-view.dto';
import { GetDossierFeesCommand } from '../dto/fee.command';
import { FEE_CHARGE_REPOSITORY, FeeChargeRepository } from '../ports/fee-charge.repository';
import { FEE_TRANSACTION_REPOSITORY, FeeTransactionRepository } from '../ports/fee-transaction.repository';

/**
 * Bảng phí của một hồ sơ (F46–F48).
 *
 * **Chỉ đọc** — không tự tính lại. Nếu đọc mà tính lại thì con số trên biên lai hôm nay sẽ khác
 * con số của chính hồ sơ đó tuần sau (biểu phí đổi theo ngày hiệu lực, cán bộ có thể đã điều
 * chỉnh); tính phí là hành động có chủ đích qua `POST .../actions/calculate`.
 */
@Injectable()
export class GetDossierFeesUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    @Inject(FEE_CHARGE_REPOSITORY)
    private readonly charges: FeeChargeRepository,
    @Inject(FEE_TRANSACTION_REPOSITORY)
    private readonly transactions: FeeTransactionRepository,
    @Inject(FEE_STEP_GATE)
    private readonly feeStepGate: FeeStepGateQuery,
    private readonly scope: DossierScopeService,
  ) {}

  async execute(command: GetDossierFeesCommand): Promise<FeeSheetView> {
    const declaration = await this.declarations.findById(command.dossierId);
    if (!declaration) throw appNotFound('fee.dossierNotFound');
    this.scope.assertAccessible(declaration, command.access);

    const [charges, transactions, feeStepReached] = await Promise.all([
      this.charges.findByDossier(declaration.id),
      this.transactions.findByDossier(declaration.id),
      this.feeStepGate.hasReachedFeeStep(declaration.id),
    ]);
    return {
      ...toFeeSheetView(charges, transactions, feeStepReached),
      dossierCode: declaration.code,
    };
  }
}
