/**
 * Chuyển đổi tiền giữa cột `numeric` của PostgreSQL và `number` của TypeScript.
 *
 * Driver `pg` trả `numeric` về dạng **chuỗi** (cố ý — nó không dám tự làm tròn thay ứng dụng), nên
 * mọi nơi đọc tiền phải đi qua đây thay vì `Number(row.amount)` rải rác. Chiều ghi cũng để chuỗi:
 * truyền `number` cho cột `numeric` là đường dẫn duy nhất mà số thực nhị phân có thể chui vào.
 */

/** Đọc cột tiền `numeric` → **số nguyên đồng**. Giá trị rỗng/không hợp lệ đọc thành 0. */
export function readAmount(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

/** Đọc cột lượng `numeric` — giữ nguyên phần thập phân (lượng có thể lẻ, tiền thì không). */
export function readQuantity(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Ghi một số về cột `numeric` dưới dạng chuỗi. */
export function writeNumeric(value: number, fractionDigits = 2): string {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : (0).toFixed(fractionDigits);
}
