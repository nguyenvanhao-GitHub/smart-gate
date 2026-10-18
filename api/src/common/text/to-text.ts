/**
 * Ép một giá trị **không rõ kiểu** — đọc từ cột `jsonb`, từ dòng SQL thô hay từ danh mục do quản
 * trị viên tự nhập — về chuỗi hiển thị.
 *
 * Vì sao không dùng thẳng `String(value)`: nếu dữ liệu thực tế là đối tượng hoặc mảng thì
 * `String(value)` cho ra `"[object Object]"` — một chuỗi **trông hợp lệ nhưng sai**, sẽ lặng lẽ
 * chui vào mã cơ quan của mục kiểm tra, vào ô của tệp báo cáo Excel hay vào mã chốt kiểm soát mà
 * không có bất kỳ lỗi nào được ném ra. Ở đây giá trị không phải kiểu nguyên thủy được coi là
 * **dữ liệu không hợp lệ** và trả về `fallback`, để chỗ gọi tự xử lý phần thiếu.
 */
export function toText(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return fallback;
}
