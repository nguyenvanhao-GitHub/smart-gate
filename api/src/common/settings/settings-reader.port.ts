/**
 * Cổng đọc tham số cấu hình hệ thống (BA-092). Đặt ở `common` để mọi phân hệ đọc được giá trị cấu
 * hình mà không phụ thuộc vào hiện thực của module `system` — giống khuôn `AUDIT_LOGGER`.
 * `SystemModule` là `@Global()` và export token này.
 */
export const SETTINGS_READER = Symbol('SETTINGS_READER');

export interface SettingsReader {
  /** Đọc giá trị thô (chuỗi) của một tham số theo khóa; chưa cấu hình thì trả `null`. */
  getValue(key: string): Promise<string | null>;
}
