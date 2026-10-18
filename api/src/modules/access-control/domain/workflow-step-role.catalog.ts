import { WorkflowStepCode } from '../../declarations/domain/declaration.enums';

export interface WorkflowStepRoleDefinition {
  stepCode: WorkflowStepCode;
  /** Mã lực lượng trong `ForceProgress` — dùng ở P3 khi gỡ bảng cứng của WorkflowPolicyService. */
  force: string | null;
  roleCode: string;
  sortOrder: number;
}

/**
 * Vai trò nào được xác nhận bước nào — dữ liệu thay cho bảng hard-code trong
 * `workflow-policy.service.ts`. Ở P1 mới seed dữ liệu và cho đọc qua API; P3 mới chuyển
 * `WorkflowPolicyService` sang đọc bảng này.
 */
export const WORKFLOW_STEP_ROLE_CATALOG: WorkflowStepRoleDefinition[] = [
  { stepCode: WorkflowStepCode.EXPORT_DECLARED, force: null, roleCode: 'ENTERPRISE', sortOrder: 1 },
  { stepCode: WorkflowStepCode.EXPORT_DECLARED, force: null, roleCode: 'INDIVIDUAL', sortOrder: 1 },
  { stepCode: WorkflowStepCode.EXPORT_B2_ENTRY, force: 'borderGuard', roleCode: 'BORDER_GUARD', sortOrder: 2 },
  { stepCode: WorkflowStepCode.EXPORT_CUSTOMS, force: 'customs', roleCode: 'CUSTOMS', sortOrder: 3 },
  { stepCode: WorkflowStepCode.EXPORT_QUARANTINE, force: 'healthQuarantine', roleCode: 'QUARANTINE', sortOrder: 4 },
  { stepCode: WorkflowStepCode.EXPORT_BORDER, force: 'borderGuard', roleCode: 'BORDER_GUARD', sortOrder: 5 },
  { stepCode: WorkflowStepCode.EXPORT_FEE, force: 'taxFee', roleCode: 'FEE_COLLECTOR', sortOrder: 6 },
  { stepCode: WorkflowStepCode.EXPORT_B1_EXIT, force: 'borderGuard', roleCode: 'BORDER_GUARD', sortOrder: 7 },
  { stepCode: WorkflowStepCode.IMPORT_DECLARED, force: null, roleCode: 'ENTERPRISE', sortOrder: 1 },
  { stepCode: WorkflowStepCode.IMPORT_DECLARED, force: null, roleCode: 'INDIVIDUAL', sortOrder: 1 },
  { stepCode: WorkflowStepCode.IMPORT_B1_ENTRY, force: 'borderGuard', roleCode: 'BORDER_GUARD', sortOrder: 2 },
  { stepCode: WorkflowStepCode.IMPORT_BORDER, force: 'borderGuard', roleCode: 'BORDER_GUARD', sortOrder: 3 },
  { stepCode: WorkflowStepCode.IMPORT_QUARANTINE, force: 'healthQuarantine', roleCode: 'QUARANTINE', sortOrder: 4 },
  { stepCode: WorkflowStepCode.IMPORT_CUSTOMS, force: 'customs', roleCode: 'CUSTOMS', sortOrder: 5 },
  { stepCode: WorkflowStepCode.IMPORT_FEE, force: 'economicZoneFee', roleCode: 'FEE_COLLECTOR', sortOrder: 6 },
  { stepCode: WorkflowStepCode.IMPORT_B2_EXIT, force: 'borderGuard', roleCode: 'BORDER_GUARD', sortOrder: 7 },
];
