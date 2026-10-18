import { ReasonCodeView } from '../../../catalog/domain/reason-code.catalog';

export const FEE_REASON_CODE_CATALOG = Symbol('FEE_REASON_CODE_CATALOG');

/**
 * Tra mã lý do điều chỉnh phí (nhóm `REASON_FEE_ADJUST`, điểm D9).
 *
 * Mã lý do là **dữ liệu danh mục**, không phải enum: quản trị thêm/khóa mã qua màn danh mục mà
 * không cần deploy lại, nên use-case luôn hỏi lại danh mục thay vì so với hằng số.
 */
export interface FeeReasonCodeCatalogPort {
  /** Mục đang hiệu lực theo mã; mục đã khóa coi như không tồn tại khi ghi nhận mới. */
  findActiveAdjustReason(code: string): Promise<ReasonCodeView | null>;
}
