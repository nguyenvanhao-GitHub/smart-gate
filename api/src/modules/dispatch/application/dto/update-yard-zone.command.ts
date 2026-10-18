/** Cập nhật cấu hình một khu bãi đỗ (F42). Trường không gửi thì giữ nguyên. */
export interface UpdateYardZoneCommand {
  code: string;
  /** Tên hiển thị của khu. */
  name?: string;
  /** Sức chứa công bố (số ô tối đa cho xe đứng); `0` là hợp lệ (tạm ngừng nhận xe). */
  capacity?: number;
}
