/**
 * Mã vai trò **cũ** trên cột `users.role`.
 *
 * KHÔNG còn là `enum` mà là hằng số + kiểu `string` mở, vì **vai trò là dữ liệu động**: nguồn sự
 * thật là bảng `roles` / `user_roles` (RBAC), quản trị thêm vai trò qua giao diện chứ không phải
 * sửa mã nguồn. Trước đây mỗi lần thêm một mã phải sửa enum **và** kiểu enum của PostgreSQL — đã
 * thực sự gây lỗi `22P02` khi seed môi trường sạch (xem migration `UserRoleToVarchar`).
 *
 * Danh sách dưới đây chỉ còn là **các mã đã biết** phục vụ di trú legacy; mã lạ vẫn hợp lệ.
 * Một người có thể mang **nhiều** vai trò — đọc từ `user_roles`, không phải từ cột đơn này.
 */
export const UserRoleCode = {
  ADMIN: 'ADMIN',
  OPS: 'OPS',
  ENTERPRISE: 'DN',
  DRIVER: 'DRIVER',
  CUSTOMS_B1: 'HQ_B1',
  CUSTOMS_B2: 'HQ_B2',
  CUSTOMS_B5: 'HQ_B5',
  CUSTOMS_MOBILE: 'HQ_MOBILE',
  BORDER_B1: 'BP_B1',
  BORDER_B2_IN: 'BP_B2_IN',
  BORDER_B2_OUT: 'BP_B2_OUT',
  BORDER_B5: 'BP_B5',
  BORDER_COMPLETE: 'BP_COMPLETE',
  HEALTH_QUARANTINE: 'KD_YT',
  PLANT_QUARANTINE: 'KD_TV',
  ANIMAL_QUARANTINE: 'KD_DV',
  TAX: 'TAX',
  ECONOMIC_ZONE: 'BQL',
  // Bổ sung để có tài khoản cho vai trò SRS Quản lý bãi (UI-10). Vai trò "Nhân viên cổng"
  // (GATE_OFFICER) đã bỏ theo CR42 — xác nhận xe vào/ra do Biên phòng thực hiện ở màn Cổng vào/ra.
  YARD_MANAGER: 'YARD_MANAGER',
} as const;

export type UserRoleCode = string;
