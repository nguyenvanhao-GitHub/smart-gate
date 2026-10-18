/**
 * Tiện ích ngày-giờ theo **giờ Việt Nam** (Asia/Ho_Chi_Minh, UTC+7, không có giờ mùa hè).
 *
 * Dùng chung cho mọi chỗ cần "ngày vận hành" thay vì cắt ngày từ UTC: phần ngày của **mã hồ sơ**
 * (F14) và **mốc ngày khung giờ** tiếp nhận (F28). Cắt ngày bằng `new Date().toISOString()` lấy ngày
 * theo UTC, lệch 1 ngày với người dùng Việt Nam trong khoảng 00:00–07:00 giờ VN (BUG-022).
 *
 * TypeScript thuần, không phụ thuộc framework — dùng được cả ở tầng `domain/`. Không hard-code offset
 * rải rác nơi khác: mọi chỗ cần ngày/giờ VN gọi qua đây.
 */

/** Lệch múi giờ Việt Nam so với UTC (phút). VN cố định UTC+7, không đổi theo mùa. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Cùng mốc thời gian nhưng dịch sang giờ VN để đọc bằng các getter UTC (`getUTC*`/`toISOString`). */
function toVietnam(date: Date): Date {
  return new Date(date.getTime() + VN_OFFSET_MS);
}

/** Ngày theo giờ VN dạng `YYYY-MM-DD`. */
export function vietnamDateString(date: Date = new Date()): string {
  return toVietnam(date).toISOString().slice(0, 10);
}

/** Giờ-phút theo giờ VN dạng `HH:mm`. */
export function vietnamTimeString(date: Date = new Date()): string {
  return toVietnam(date).toISOString().slice(11, 16);
}

/**
 * Mốc UTC ứng với **đầu ngày VN** (00:00:00.000 giờ VN) của ngày VN chứa `date`.
 *
 * Dùng cho biên dưới của bộ lọc khoảng ngày: một ngày trên giao diện là **ngày dương lịch giờ VN**,
 * không phải ngày UTC. Cắt `to`/`from` bằng chuỗi `YYYY-MM-DD` thô (mốc 00:00 UTC) loại nhầm cả ngày
 * (BUG-025).
 */
export function vietnamDayStart(date: Date = new Date()): Date {
  return new Date(`${vietnamDateString(date)}T00:00:00.000+07:00`);
}

/**
 * Mốc UTC ứng với **cuối ngày VN** (23:59:59.999 giờ VN) của ngày VN chứa `date` — biên trên bao trùm
 * hết ngày kết thúc trong bộ lọc khoảng ngày (BUG-025).
 */
export function vietnamDayEnd(date: Date = new Date()): Date {
  return new Date(`${vietnamDateString(date)}T23:59:59.999+07:00`);
}

/**
 * Đổi chuỗi ngày bắt đầu thành mốc UTC ứng với **đầu ngày VN** (00:00:00.000 giờ VN).
 * Nhận chuỗi `YYYY-MM-DD` hoặc ISO.
 */
export function parseFilterStartDate(value?: string): Date | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000+07:00`);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Đổi chuỗi ngày kết thúc thành mốc UTC ứng với **cuối ngày VN** (23:59:59.999 giờ VN).
 * Nhận chuỗi `YYYY-MM-DD` hoặc ISO.
 */
export function parseFilterEndDate(value?: string): Date | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T23:59:59.999+07:00`);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

