// =============================================================================
// Danh mục **mã định danh** của phân hệ thu phí.
//
// Trước đây loại hành động được đoán từ nhãn tiếng Việt: `action.includes('huy')` → hủy thanh toán,
// `action.includes('gộp')` → gộp hóa đơn. Hệ quả: đổi lời văn nút bấm (hoặc gửi tiếng Anh) là đổi
// nghiệp vụ, và một chuỗi bất kỳ không chứa "huy"/"gộp" **âm thầm** rơi vào nhánh thu tiền.
// Nay: mã ASCII, tập đóng, khớp bằng; mã lạ bị từ chối 400.
//
// **Đã gỡ hành động `COLLECT` (thu tiền) khỏi màn thu phí theo lực lượng (BUG-007):** trước đây nó
// trả 201 nhưng chỉ ghi nhật ký, KHÔNG tạo giao dịch/không đổi điều kiện qua cổng. Việc thu tiền
// THẬT chỉ đi qua `POST /declarations/:id/fees/transactions` (tạo `FeeTransaction` + xác nhận).
// Màn `/fees/:slug` nay là **tra cứu/đối soát**; các hành động còn lại chỉ **ghi nhật ký thao tác**.
// =============================================================================

/** Mã màn thu phí — tập đóng. Mỗi màn gắn đúng một khoản phí. */
export const FEE_SLUGS = ['tax', 'economic-zone'] as const;

export type FeeSlug = (typeof FEE_SLUGS)[number];

/** Mã hành động thu phí — tập đóng. Đây đều là thao tác **đối soát/ghi nhật ký**, không thu tiền. */
export const FEE_ACTIONS = [
  /** Ghi nhận yêu cầu thanh toán bổ sung (do thay đổi xe/hàng hóa). */
  'SUPPLEMENT_PAYMENT',
  /** Hủy/hoàn khoản phí — ghi nhật ký đối soát. */
  'CANCEL_PAYMENT',
  /** Thanh toán gộp nhiều hồ sơ. */
  'MERGE_PAYMENT',
  /** Gộp hóa đơn. */
  'MERGE_INVOICE',
] as const;

export type FeeActionCode = (typeof FEE_ACTIONS)[number];

/** Tác động nghiệp vụ của một hành động phí. */
export type FeeActionEffect = 'PAYMENT' | 'CANCEL' | 'MERGE';

export const FEE_ACTION_EFFECTS: Record<FeeActionCode, FeeActionEffect> = {
  SUPPLEMENT_PAYMENT: 'PAYMENT',
  CANCEL_PAYMENT: 'CANCEL',
  MERGE_PAYMENT: 'MERGE',
  MERGE_INVOICE: 'MERGE',
};

/** Mã trường tra cứu trên thanh lọc — web tra nhãn theo mã, không nhận chuỗi tiếng Việt từ API. */
export const FEE_SEARCH_FIELDS = [
  'PLATE_NUMBER',
  'TRAILER_NUMBER',
  'FEE_CODE',
  'TAX_CODE',
  'CUSTOMS_DECLARATION_NO',
] as const;

export type FeeSearchFieldCode = (typeof FEE_SEARCH_FIELDS)[number];

/** Nhóm phí (khớp `FeeType` của biểu phí) mà một màn thu phí phản ánh — web tra nhãn theo mã. */
export type FeeTypeCode = 'INFRASTRUCTURE' | 'PARKING' | 'SERVICE' | 'QUARANTINE' | 'TAX';

export interface FeeScreenDefinition {
  slug: FeeSlug;
  /** Khoản phí trên hồ sơ mà màn này thao tác. */
  force: 'taxFee' | 'economicZoneFee';
  /** Nhóm phí (biểu phí) tương ứng với khoản phí của màn — hiện trên cột "Loại phí". */
  feeType: FeeTypeCode;
  searchFields: FeeSearchFieldCode[];
  actions: FeeActionCode[];
}

const COMMON_FEE_ACTIONS: FeeActionCode[] = [
  'SUPPLEMENT_PAYMENT',
  'CANCEL_PAYMENT',
  'MERGE_PAYMENT',
  'MERGE_INVOICE',
];

export const FEE_SCREENS: Record<FeeSlug, FeeScreenDefinition> = {
  tax: {
    slug: 'tax',
    force: 'taxFee',
    feeType: 'TAX',
    searchFields: ['PLATE_NUMBER', 'TRAILER_NUMBER', 'FEE_CODE', 'TAX_CODE'],
    actions: [...COMMON_FEE_ACTIONS],
  },
  'economic-zone': {
    slug: 'economic-zone',
    force: 'economicZoneFee',
    feeType: 'INFRASTRUCTURE',
    searchFields: ['PLATE_NUMBER', 'TRAILER_NUMBER', 'FEE_CODE', 'TAX_CODE'],
    actions: [...COMMON_FEE_ACTIONS],
  },
};

export function isFeeSlug(value: string): value is FeeSlug {
  return (FEE_SLUGS as readonly string[]).includes(value);
}

export function isFeeAction(value: string): value is FeeActionCode {
  return (FEE_ACTIONS as readonly string[]).includes(value);
}
