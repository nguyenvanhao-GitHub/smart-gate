import { WorkflowStepRoleRow } from '../../domain/workflow-route';

export const WORKFLOW_STEP_DIRECTORY = Symbol('WORKFLOW_STEP_DIRECTORY');

/**
 * Nguồn **duy nhất** của thứ tự bước và vai trò được phép thao tác: bảng `workflow_step_roles`.
 * Đọc lại ở mỗi lần dùng, cố ý **không cache** — quản trị sửa cấu hình là có hiệu lực ngay,
 * giống cách `AccessContextService` xử lý ma trận phân quyền.
 */
export interface WorkflowStepDirectory {
  listStepRoles(): Promise<WorkflowStepRoleRow[]>;
}
