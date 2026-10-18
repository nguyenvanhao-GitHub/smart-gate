/**
 * Quyết định của lực lượng chuyên ngành trên một bước (UI-07).
 *
 * Ba lựa chọn (CR36): **APPROVE** = "Xác nhận hoàn thành", **REQUEST_SUPPLEMENT** = "Yêu cầu sửa
 * đổi, bổ sung", **REJECT** = "Từ chối". `FORWARD` (chuyển tiếp) và `REVOKE` (thu hồi xác nhận) đã
 * bị bỏ hẳn khỏi luồng.
 */
export enum WorkflowDecision {
  APPROVE = 'APPROVE',
  REQUEST_SUPPLEMENT = 'REQUEST_SUPPLEMENT',
  REJECT = 'REJECT',
}

/** Trạng thái của cả phiên xử lý liên ngành của một hồ sơ. */
export enum WorkflowInstanceStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  WAITING_SUPPLEMENT = 'WAITING_SUPPLEMENT',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
}

/** Trạng thái từng bước trong phiên. */
export enum WorkflowStepStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  WAITING_SUPPLEMENT = 'WAITING_SUPPLEMENT',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
}

/** Ba tab của hàng đợi: cần xử lý · đã xử lý · chờ bổ sung. */
export enum QueueTab {
  TODO = 'todo',
  DONE = 'done',
  WAITING = 'waiting',
}

/** Quyết định nào kết thúc bước hiện tại và đẩy hồ sơ sang bước kế tiếp. */
export function advancesToNextStep(decision: WorkflowDecision): boolean {
  return decision === WorkflowDecision.APPROVE;
}
