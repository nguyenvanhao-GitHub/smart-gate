import { Inject, Injectable } from '@nestjs/common';
import { FeeSettlementQuery, FeeSettlementSnapshot } from '../../../../common/fees/fee-settlement.port';
import { feeTotals } from '../../domain/fee-calculation.rules';
import { settlementOf } from '../../domain/fee-settlement.rules';
import { FEE_CHARGE_REPOSITORY, FeeChargeRepository } from '../ports/fee-charge.repository';
import { FEE_TRANSACTION_REPOSITORY, FeeTransactionRepository } from '../ports/fee-transaction.repository';

/**
 * Hiện thực cổng `FEE_SETTLEMENT` — **nguồn sự thật duy nhất** cho câu hỏi "hồ sơ đã thanh toán
 * xong chưa" (F48), và là thứ mà quy tắc mở cổng ra đối chiếu (F39).
 *
 * Đặt ở `application/` chứ không phải `infrastructure/` vì nó là **quy tắc gộp** (tổng phải thu so
 * với tổng đã xác nhận), chỉ mượn hai repository để lấy số liệu.
 */
@Injectable()
export class FeeSettlementService implements FeeSettlementQuery {
  constructor(
    @Inject(FEE_CHARGE_REPOSITORY)
    private readonly charges: FeeChargeRepository,
    @Inject(FEE_TRANSACTION_REPOSITORY)
    private readonly transactions: FeeTransactionRepository,
  ) {}

  async snapshotOf(dossierId: string): Promise<FeeSettlementSnapshot> {
    const [charges, confirmed] = await Promise.all([
      this.charges.findByDossier(dossierId),
      this.transactions.sumConfirmed(dossierId),
    ]);
    return settlementOf(feeTotals(charges).total, confirmed);
  }
}
