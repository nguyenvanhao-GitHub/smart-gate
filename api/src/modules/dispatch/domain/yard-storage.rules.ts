/**
 * Quy tắc "giờ lưu bãi tối đa" (F42/F44) — dùng để tính **dự kiến rời bãi** và cờ **quá hạn**.
 *
 * Cấu hình bằng **biến môi trường** `YARD_MAX_STORAGE_HOURS` (một tham số hệ thống, đọc qua
 * `ConfigService`), KHÔNG thêm bảng/di trú. Thiếu hoặc sai định dạng thì rơi về mặc định.
 */
export const YARD_MAX_STORAGE_HOURS_ENV = 'YARD_MAX_STORAGE_HOURS';

/** Mặc định 48 giờ (2 ngày) khi chưa cấu hình. Số liệu tạm theo nghiệp vụ, chỉnh qua biến môi trường. */
export const DEFAULT_MAX_YARD_STORAGE_HOURS = 48;

const MS_PER_HOUR = 3_600_000;

/** Chuẩn hoá giá trị cấu hình: số nguyên dương thì dùng, còn lại rơi về mặc định. */
export function resolveMaxStorageHours(raw: string | number | null | undefined): number {
  const value = Math.floor(Number(raw));
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_YARD_STORAGE_HOURS;
}

/** Mốc dự kiến rời bãi = giờ vào bãi + số giờ lưu tối đa. */
export function computeExpectedDeparture(assignedAt: Date, maxStorageHours: number): Date {
  return new Date(assignedAt.getTime() + maxStorageHours * MS_PER_HOUR);
}

/** Quá hạn khi thời điểm hiện tại đã vượt mốc dự kiến rời bãi. */
export function isOverdue(expectedDeparture: Date, now: Date): boolean {
  return now.getTime() > expectedDeparture.getTime();
}

/**
 * Mốc "vào bãi cũ hơn ngưỡng này thì quá hạn" — dùng cho câu đếm ở tầng database:
 * `assigned_at < overdueThreshold(now, maxHours)`.
 */
export function overdueThreshold(now: Date, maxStorageHours: number): Date {
  return new Date(now.getTime() - maxStorageHours * MS_PER_HOUR);
}
