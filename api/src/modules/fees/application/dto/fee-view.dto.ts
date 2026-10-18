import { FeeSettlementSnapshot } from '../../../../common/fees/fee-settlement.port';
import { FeeCharge } from '../../domain/fee-charge.entity';
import { FeeTransaction } from '../../domain/fee-transaction.entity';
import { feeTotals } from '../../domain/fee-calculation.rules';
import { settlementOf } from '../../domain/fee-settlement.rules';
import { FEE_CURRENCY, FeeTransactionMethod, FeeTransactionStatus, FeeUnit } from '../../domain/fee.enums';

/**
 * Hợp đồng dữ liệu của bảng phí một hồ sơ — **đã chốt với web**, đừng đổi tên trường.
 *
 * `settled`/`outstanding` được trả kèm ngay trong bảng phí để màn hình thu phí và màn hình cổng
 * đọc **cùng một con số**: nghĩa vụ tài chính chỉ có một nguồn sự thật (`settlementOf`).
 */
export interface FeeItemView {
  ruleCode: string;
  name: string;
  unit: FeeUnit;
  quantity: number;
  unitAmount: number;
  amount: number;
  /** True khi số tiền do cán bộ điều chỉnh kèm mã lý do, không phải do biểu phí sinh ra (F47). */
  adjusted: boolean;
}

export interface FeeTransactionView {
  id: string;
  amount: number;
  method: FeeTransactionMethod;
  referenceCode: string;
  attachmentId: string | null;
  status: FeeTransactionStatus;
  confirmedAt: Date | null;
  confirmedByName: string | null;
  note: string | null;
}

export interface FeeSheetView {
  dossierCode?: string;
  items: FeeItemView[];
  subtotal: number;
  vatAmount: number;
  total: number;
  currency: string;
  transactions: FeeTransactionView[];
  settled: boolean;
  outstanding: number;
  /**
   * Hồ sơ đã tới bước thu phí trong quy trình chưa (quyết định chủ dự án: chỉ được ghi/xác nhận giao
   * dịch phí khi đã tới bước phí). Web dùng cờ này để bật/tắt nút thu — **không tự tính luật**.
   */
  feeStepReached: boolean;
}

export function toFeeItemView(charge: FeeCharge): FeeItemView {
  return {
    ruleCode: charge.ruleCode,
    name: charge.name,
    unit: charge.unit,
    quantity: charge.quantity,
    unitAmount: charge.unitAmount,
    amount: charge.amount,
    adjusted: charge.adjusted,
  };
}

export function toFeeTransactionView(transaction: FeeTransaction): FeeTransactionView {
  return {
    id: transaction.id,
    amount: transaction.amount,
    method: transaction.method,
    referenceCode: transaction.referenceCode,
    attachmentId: transaction.attachmentId,
    status: transaction.status,
    confirmedAt: transaction.confirmedAt,
    confirmedByName: transaction.confirmedByName,
    note: transaction.note,
  };
}

/** Nghĩa vụ tài chính suy từ bảng phí đã chốt và các giao dịch **đã xác nhận**. */
export function settlementFor(charges: FeeCharge[], transactions: FeeTransaction[]): FeeSettlementSnapshot {
  const totals = feeTotals(charges);
  const confirmed = transactions
    .filter((transaction) => transaction.isConfirmed)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  return settlementOf(totals.total, confirmed);
}

export function toFeeSheetView(
  charges: FeeCharge[],
  transactions: FeeTransaction[],
  feeStepReached = false,
): FeeSheetView {
  const totals = feeTotals(charges);
  const settlement = settlementFor(charges, transactions);
  return {
    items: charges.map((charge) => toFeeItemView(charge)),
    subtotal: totals.subtotal,
    vatAmount: totals.vatAmount,
    total: totals.total,
    currency: FEE_CURRENCY,
    transactions: transactions.map((transaction) => toFeeTransactionView(transaction)),
    settled: settlement.settled,
    outstanding: settlement.outstanding,
    feeStepReached,
  };
}
