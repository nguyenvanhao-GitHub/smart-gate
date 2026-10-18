/**
 * Cổng tra **nghĩa vụ tài chính của một hồ sơ** (F48). Đặt ở `common/` theo đúng nếp của
 * `audit-logger.port` và `notification-publisher.port`: phân hệ cổng (`gate`, `smart-gate`) cần
 * biết hồ sơ đã thanh toán xong chưa mà **không được** phụ thuộc vào chi tiết bên trong phân hệ
 * phí. `FeesModule` cung cấp hiện thực và xuất khẩu token này.
 */
export const FEE_SETTLEMENT = Symbol('FEE_SETTLEMENT');

/** Ảnh chụp nghĩa vụ tài chính. Mọi số tiền là **số nguyên đồng (VND)**. */
export interface FeeSettlementSnapshot {
  /** Tổng phải thu theo bảng phí đã chốt của hồ sơ. */
  total: number;
  /** Tổng tiền của các giao dịch **đã xác nhận**. */
  confirmed: number;
  /** Còn thiếu = `total - confirmed`, không âm. */
  outstanding: number;
  /** True khi không còn khoản nào chưa được xác nhận thanh toán. */
  settled: boolean;
  currency: string;
}

/** Giá trị dùng khi chưa có dữ liệu phí — hồ sơ không phát sinh nghĩa vụ nào. */
export const NO_FEE_OBLIGATION: FeeSettlementSnapshot = {
  total: 0,
  confirmed: 0,
  outstanding: 0,
  settled: true,
  currency: 'VND',
};

export interface FeeSettlementQuery {
  /** Nghĩa vụ tài chính hiện tại của hồ sơ. Hồ sơ chưa tính phí trả về `NO_FEE_OBLIGATION`. */
  snapshotOf(dossierId: string): Promise<FeeSettlementSnapshot>;
}
