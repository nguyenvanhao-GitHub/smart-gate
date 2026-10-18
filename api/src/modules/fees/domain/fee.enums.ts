/**
 * Mã định danh của phân hệ thu phí (F46–F48) — **tập đóng, ASCII**, nhãn tra qua i18n/danh mục.
 *
 * ### Kiểu tiền dùng trong cả phân hệ
 * Mọi **số tiền** là **số nguyên đồng Việt Nam (VND)**: VND không có đơn vị phụ đang lưu hành, nên
 * "đơn vị nhỏ nhất" chính là đồng. Trong database, cột tiền là `numeric(18,2)` (không phải `float`,
 * không phải `double precision`) để không bao giờ mất chính xác khi cộng dồn; khi đọc lên,
 * repository đổi sang `number` — an toàn vì trần `Number.MAX_SAFE_INTEGER` ≈ 9·10¹⁵ đồng, lớn hơn
 * mọi khoản phí cửa khẩu nhiều bậc. Kết quả tính phí luôn được `Math.round` về số nguyên đồng.
 */

/** Đơn vị tính của một dòng biểu phí. */
export enum FeeUnit {
  /** Thu theo lượt xe qua cửa khẩu. */
  TRIP = 'TRIP',
  /** Thu theo ngày lưu bãi. */
  DAY = 'DAY',
  /** Thu theo tấn hàng (làm tròn lên). */
  TON = 'TON',
  /** Tỷ lệ phần trăm tính trên tổng các khoản không phải phần trăm (VAT). */
  PERCENT = 'PERCENT',
}

/** Nhóm phí — dùng để gộp nhóm trên báo cáo đối soát và nghĩa vụ tài chính. */
export enum FeeType {
  INFRASTRUCTURE = 'INFRASTRUCTURE',
  PARKING = 'PARKING',
  SERVICE = 'SERVICE',
  QUARANTINE = 'QUARANTINE',
  TAX = 'TAX',
}

/**
 * Phương thức thanh toán ghi nhận trên giao dịch (F48).
 *
 * Ba mã này là **hợp đồng đã chốt với web** (`CASH` · `TRANSFER` · `E_WALLET`) — chúng đi thẳng ra
 * JSON và vào cột `fee_transactions.method`, nên đổi mã là đổi cả dữ liệu đã lưu.
 *
 * `CARD` (Thẻ ngân hàng) **đã gỡ khỏi tập chọn mới** để khớp mockup `thu-phi.html` (3 phương thức).
 * Giao dịch cũ đã lưu `method='CARD'` **vẫn đọc được** (mapper cast nguyên chuỗi, không kiểm enum) và
 * web vẫn có nhãn cho nó; chỉ giao dịch **mới** với `CARD` bị `@IsEnum` từ chối 400.
 */
export enum FeeTransactionMethod {
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
  E_WALLET = 'E_WALLET',
}

/**
 * Trạng thái giao dịch. Mọi lần thu nay ghi **thẳng** ở `CONFIRMED` trong một bước nguyên tử (bỏ
 * bước `PENDING` "ghi nhận rồi xác nhận" — cấu hình vai trò không tách người thu với người duyệt nên
 * hai bước không tạo kiểm soát gì, chỉ sinh giao dịch treo làm kẹt hồ sơ). Chỉ `CONFIRMED` tính là
 * hoàn thành nghĩa vụ tài chính (F48) — điều kiện cổng ra đối chiếu ở F39. `CANCELLED` giữ cho giao
 * dịch đã thu bị hủy/điều chỉnh.
 */
export enum FeeTransactionStatus {
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

/** Đơn vị tiền tệ duy nhất của MVP. */
export const FEE_CURRENCY = 'VND';
