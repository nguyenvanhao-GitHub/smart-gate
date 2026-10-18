import { UserAccessContext } from '../../../../common/auth/access-context';
import { WorkflowDecision } from '../../domain/workflow.enums';

export interface ChecklistUpdateCommand {
  code: string;
  checked: boolean;
  note?: string;
}

export interface DecideWorkflowStepCommand {
  dossierId: string;
  stepCode: string;
  decision: WorkflowDecision;
  /** Mã lý do (tùy chọn) khi yêu cầu bổ sung hoặc từ chối (SRS 7.2 / F23, F24). */
  reasonCode?: string;
  /** Nội dung lý do — bắt buộc với yêu cầu bổ sung và từ chối (CR37). */
  reasonNote?: string;
  checklist?: ChecklistUpdateCommand[];
  actorId: string;
  /** Danh sách vai trò RBAC (nối bằng `+`) — chỉ để ghi vào `auditTrail` của hồ sơ, không phân quyền. */
  actorRole: string;
  access: UserAccessContext;
}
