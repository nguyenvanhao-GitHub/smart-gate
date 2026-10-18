/** Mã lỗi "unique_violation" của PostgreSQL. */
const UNIQUE_VIOLATION = '23505';

/**
 * Đọc lỗi trùng chỉ mục duy nhất (PostgreSQL `23505`) từ lỗi TypeORM.
 *
 * Trả về tên `constraint` bị vi phạm (có thể `null` nếu driver không đính kèm) để nơi gọi tự ánh xạ
 * sang lỗi nghiệp vụ tương ứng; trả `null` khi không phải lỗi trùng chỉ mục.
 */
export function readUniqueViolation(error: unknown): { constraint: string | null; detail: string | null } | null {
  const driver = (error as { driverError?: { code?: string; constraint?: string; detail?: string } })?.driverError;
  if (driver?.code !== UNIQUE_VIOLATION) return null;
  return { constraint: driver.constraint ?? null, detail: driver.detail ?? null };
}
