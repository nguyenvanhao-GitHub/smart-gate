/** Lệnh cập nhật một hoặc nhiều tham số cấu hình hệ thống (BA-092). */
export interface UpdateSystemSettingsCommand {
  items: { key: string; value: string }[];
  /** Id người thực hiện — ghi vào `updated_by_id` và nhật ký kiểm toán. */
  actorId: string;
}
