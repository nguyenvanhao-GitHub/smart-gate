export const WORKFLOW_ACTOR_DIRECTORY = Symbol('WORKFLOW_ACTOR_DIRECTORY');

export interface WorkflowActor {
  id: string;
  fullName: string;
}

/**
 * Tên hiển thị của người thao tác. Lưu kèm vào bước/nhật ký để lịch sử hồ sơ vẫn đọc được sau khi
 * tài khoản bị đổi tên hoặc khóa — đây là dữ liệu chứng cứ, không phải tham chiếu sống.
 */
export interface WorkflowActorDirectory {
  findById(userId: string): Promise<WorkflowActor | null>;
}
