import { DeclarationStatus } from '../../declarations/domain/declaration.enums';
import { isInspectionStep, workflowStepMetadata } from '../../declarations/domain/workflow-step.catalog';
import { WorkflowInstance } from './workflow-instance.entity';
import { WorkflowRoute } from './workflow-route';
import { WorkflowInstanceStatus, WorkflowStepStatus } from './workflow.enums';

/**
 * Trạng thái hồ sơ suy ra từ phiên xử lý liên ngành (Phụ lục A của SRS + CR44).
 *
 * - đang ở **cụm nghiệp vụ song song** (≥1 bước nghiệp vụ mở) → `BUSINESS_PROCESSING` ("Đang xử lý
 *   nghiệp vụ") — trạng thái đại diện cho cả cụm;
 * - nếu có bất kỳ bước nào bị yêu cầu bổ sung → `REVISION_REQUIRED` ("Cần bổ sung") để mở quyền sửa;
 * - đang chờ **một** bước đơn (cổng vào / thu phí) → `WAITING_*` của bước đó;
 * - đang đứng ở bước cổng ra → `READY_FOR_EXIT`;
 * - đã qua cổng ra / hoàn thành phiên → `COMPLETED`.
 */
export function dossierStatusFor(instance: WorkflowInstance, route: WorkflowRoute): DeclarationStatus {
  if (instance.status === WorkflowInstanceStatus.REJECTED) return DeclarationStatus.REJECTED;
  if (
    instance.status === WorkflowInstanceStatus.WAITING_SUPPLEMENT ||
    instance.steps.some((step) => step.status === WorkflowStepStatus.WAITING_SUPPLEMENT)
  ) {
    return DeclarationStatus.REVISION_REQUIRED;
  }
  if (instance.status === WorkflowInstanceStatus.COMPLETED) return DeclarationStatus.COMPLETED;

  // CR44 — còn bất kỳ bước nghiệp vụ nào đang mở thì hồ sơ mang trạng thái đại diện của cả cụm.
  if (instance.activeStepCodes.some((code) => isInspectionStep(code))) {
    return DeclarationStatus.BUSINESS_PROCESSING;
  }

  const stepCode = instance.currentStepCode;
  if (!stepCode) return DeclarationStatus.BUSINESS_PROCESSING;
  if (route.isLast(stepCode)) return DeclarationStatus.READY_FOR_EXIT;
  return workflowStepMetadata(stepCode)?.waitingStatus ?? DeclarationStatus.BUSINESS_PROCESSING;
}
