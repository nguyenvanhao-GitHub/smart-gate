/**
 * Phân hệ của một dòng nhật ký (F05) — nhật ký **không có cột phân hệ riêng**, mà suy từ mã ASCII của
 * `action` (tiền tố) và `targetType` (tập đóng). Đây là nguồn sự thật phía BE để lọc phân hệ ở tầng
 * máy chủ (BUG-051): thẻ thống kê và phân trang phải khớp đúng tập đã lọc, không lọc trên một trang ở
 * web nữa. Không dùng chuỗi hiển thị làm logic — chỉ so mã.
 *
 * Thứ tự ưu tiên khi quy về phân hệ: tiền tố `action` (`FEE_` → FEE, `AUTH_` → SYSTEM) xét **trước**,
 * còn lại tra theo `targetType`; loại đối tượng lạ rơi về `OTHER`.
 */
export const AUDIT_MODULE_CODES = ['DOSSIER', 'CATALOG', 'FEE', 'REPORT', 'SYSTEM', 'OTHER'] as const;

export type AuditModuleCode = (typeof AUDIT_MODULE_CODES)[number];

/** Tiền tố mã hành động quyết định phân hệ (ưu tiên trước `targetType`). */
export const AUDIT_MODULE_ACTION_PREFIX = {
  FEE: 'FEE_',
  AUTH: 'AUTH_',
} as const;

/**
 * Loại đối tượng → phân hệ (chỉ xét khi `action` không rơi vào tiền tố ưu tiên). Đồng bộ với hàm
 * `auditModuleOf` phía web; sửa một nơi phải sửa nơi kia (hai repo độc lập nên buộc trùng dữ liệu).
 */
export const AUDIT_MODULE_TARGET_TYPES: Record<Exclude<AuditModuleCode, 'OTHER'>, readonly string[]> = {
  DOSSIER: ['DECLARATION', 'DISPATCH_ASSIGNMENT', 'ATTACHMENT'],
  CATALOG: ['CATALOG_ITEM', 'CATALOG_TYPE'],
  FEE: ['FEE_RULE'],
  REPORT: ['REPORT'],
  SYSTEM: ['USER', 'ROLE', 'SYSTEM_SETTING'],
};

/** Mọi loại đối tượng đã biết — phần bù của tập này là `OTHER`. */
export const AUDIT_KNOWN_TARGET_TYPES: readonly string[] = Object.values(AUDIT_MODULE_TARGET_TYPES).flat();
