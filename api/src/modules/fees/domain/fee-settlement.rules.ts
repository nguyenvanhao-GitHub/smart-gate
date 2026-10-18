import { FeeSettlementSnapshot } from '../../../common/fees/fee-settlement.port';
import { FEE_CURRENCY } from './fee.enums';

/**
 * Quy đổi "đã thu bao nhiêu so với phải thu" thành kết luận **đã hoàn thành nghĩa vụ tài chính hay
 * chưa** (F48 → F39).
 *
 * Hai quyết định có chủ đích:
 * - Chỉ cộng **giao dịch đã xác nhận** (`CONFIRMED`); giao dịch đã hủy (`CANCELLED`) không tính.
 * - Hồ sơ **chưa phát sinh khoản phí nào** (`total = 0`) coi như đã xong: không có nghĩa vụ thì
 *   không có gì để chặn. Đây không phải fail-open — nghĩa vụ chỉ tồn tại khi biểu phí sinh ra nó.
 */
export function settlementOf(total: number, confirmed: number): FeeSettlementSnapshot {
  const outstanding = Math.max(0, Math.round(total) - Math.round(confirmed));
  return {
    total: Math.round(total),
    confirmed: Math.round(confirmed),
    outstanding,
    settled: outstanding === 0,
    currency: FEE_CURRENCY,
  };
}
