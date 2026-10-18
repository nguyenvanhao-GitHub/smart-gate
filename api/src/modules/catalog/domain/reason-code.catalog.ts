/**
 * Mã nguyên nhân (điểm **D9** của kế hoạch, phục vụ F23/F24/F47).
 *
 * SRS 7.2 bắt buộc có "mã/lý do" cho **3 tình huống** còn lại của luồng: yêu cầu bổ sung · từ chối ·
 * điều chỉnh phí, nhưng **không liệt kê danh mục mã**. (Nhóm "thu hồi xác nhận" đã bị gỡ cùng với
 * quyết định REVOKE — xem `workflow.enums.ts`.) Vì vậy:
 * - `scope` dưới đây là **cố định** (3 tình huống) — đây là hợp đồng API.
 * - Bản thân **các mã** là **dữ liệu trong bảng `catalog_items`**, không phải enum. Bộ mã đang seed
 *   trong `catalog.seed.ts` là **TẠM, chờ nghiệp vụ chốt**; quản trị thêm/sửa/khoá qua
 *   `POST|PATCH /catalogs/:type/items` và `POST /catalogs/:type/items/:id/actions/lock`
 *   mà **không cần deploy lại**.
 */
export enum ReasonScope {
  /** Yêu cầu doanh nghiệp bổ sung hồ sơ (F23). */
  SUPPLEMENT = 'SUPPLEMENT',
  /** Từ chối hồ sơ (F24). */
  REJECT = 'REJECT',
  /** Điều chỉnh khoản phí đã tính (F47). */
  FEE_ADJUST = 'FEE_ADJUST',
}

/** Nhóm mã nguyên nhân → mã loại danh mục trong bảng `catalog_types`. */
export const REASON_SCOPE_CATALOG_TYPES: Record<ReasonScope, string> = {
  [ReasonScope.SUPPLEMENT]: 'REASON_SUPPLEMENT',
  [ReasonScope.REJECT]: 'REASON_REJECT',
  [ReasonScope.FEE_ADJUST]: 'REASON_FEE_ADJUST',
};

export const REASON_SCOPE_LABELS: Record<ReasonScope, string> = {
  [ReasonScope.SUPPLEMENT]: 'Yêu cầu bổ sung',
  [ReasonScope.REJECT]: 'Từ chối',
  [ReasonScope.FEE_ADJUST]: 'Điều chỉnh phí',
};

/** Hợp đồng dữ liệu của `GET /catalog/reason-codes`. */
export interface ReasonCodeView {
  code: string;
  name: string;
  scope: ReasonScope;
  /** `false` khi mục danh mục bị khóa — vẫn trả về để hiển thị hồ sơ cũ, nhưng không cho chọn mới. */
  active: boolean;
}
