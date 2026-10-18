/**
 * Quy tắc "hạn thanh toán phí" — dùng để gắn cờ **quá hạn** cho khoản phí chưa thu trên màn thu phí
 * (UI-11) và đếm KPI "Quá hạn".
 *
 * Cấu hình bằng **biến môi trường** `FEE_PAYMENT_DEADLINE_HOURS` (một tham số hệ thống, đọc qua
 * `ConfigService`), KHÔNG thêm bảng/di trú. Thiếu hoặc sai định dạng thì rơi về mặc định. Quy tắc
 * thuần TS ở tầng domain, không phụ thuộc `@nestjs/*`, nên test được độc lập (khuôn giống
 * `dispatch/domain/yard-storage.rules.ts`).
 */
export const FEE_PAYMENT_DEADLINE_HOURS_ENV = 'FEE_PAYMENT_DEADLINE_HOURS';

/** Mặc định 72 giờ (3 ngày) khi chưa cấu hình. Số liệu tạm theo nghiệp vụ, chỉnh qua biến môi trường. */
export const DEFAULT_FEE_PAYMENT_DEADLINE_HOURS = 72;

const MS_PER_HOUR = 3_600_000;

/** Chuẩn hoá giá trị cấu hình: số nguyên dương thì dùng, còn lại rơi về mặc định. */
export function resolveDeadlineHours(raw: string | number | null | undefined): number {
  const value = Math.floor(Number(raw));
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_FEE_PAYMENT_DEADLINE_HOURS;
}

/** Mốc hạn thanh toán = thời điểm lập khoản phí + số giờ hạn thu. */
export function feePaymentDeadline(createdAt: Date, deadlineHours: number): Date {
  return new Date(createdAt.getTime() + deadlineHours * MS_PER_HOUR);
}

/** Quá hạn khi thời điểm hiện tại đã vượt mốc hạn thanh toán. */
export function isFeeOverdue(createdAt: Date, now: Date, deadlineHours: number): boolean {
  return now.getTime() > feePaymentDeadline(createdAt, deadlineHours).getTime();
}

/**
 * Mốc "lập trước thời điểm này thì quá hạn" — tiện cho câu đếm ở tầng database:
 * `created_at < overdueThreshold(now, deadlineHours)`.
 */
export function overdueThreshold(now: Date, deadlineHours: number): Date {
  return new Date(now.getTime() - deadlineHours * MS_PER_HOUR);
}
