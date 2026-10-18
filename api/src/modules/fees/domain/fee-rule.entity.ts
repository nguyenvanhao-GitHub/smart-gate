import { FeeType, FeeUnit } from './fee.enums';

/**
 * Một **bản** của một khoản trong biểu phí (F46) — bảng `fee_rules`.
 *
 * Sửa mức phí **không ghi đè bản cũ**: đóng bản đang chạy bằng `effectiveTo` rồi thêm một bản mới
 * có `effectiveFrom` sau đó. Nhờ vậy hồ sơ tính từ tháng trước vẫn tra ngược được đúng mức phí đã
 * áp dụng, đúng yêu cầu "đổi mức phí phải có ngày hiệu lực và giữ lịch sử".
 */
export class FeeRule {
  constructor(
    public readonly id: string,
    /** Mã khoản phí. **Không duy nhất một mình** — duy nhất theo cặp (mã, ngày hiệu lực từ). */
    public code: string,
    public name: string,
    public feeType: FeeType,
    public unit: FeeUnit,
    /**
     * Mức phí. Với `unit = PERCENT` đây là **tỷ lệ phần trăm** (10 = 10%); với các đơn vị còn lại
     * đây là **số tiền VND cho một đơn vị tính**.
     */
    public amount: number,
    public currency: string,
    /** Đối tượng áp dụng (loại hồ sơ / loại phương tiện). **Rỗng = áp dụng cho mọi đối tượng.** */
    public appliesTo: string[],
    /** Ngày bắt đầu hiệu lực, dạng `YYYY-MM-DD`. */
    public effectiveFrom: string,
    /** Ngày hết hiệu lực (bao gồm ngày này), `null` = còn hiệu lực vô thời hạn. */
    public effectiveTo: string | null,
    public active: boolean,
    public sortOrder: number,
    public description: string | null,
  ) {}
}
