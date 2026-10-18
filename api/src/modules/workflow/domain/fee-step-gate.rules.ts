import { workflowStepMetadata } from '../../declarations/domain/workflow-step.catalog';
import { WorkflowInstance } from './workflow-instance.entity';
import { FEE_STEP_AGENCY_CODE, WorkflowRoute } from './workflow-route';
import { WorkflowStepStatus } from './workflow.enums';

/**
 * Bước có phải **bước thu phí** không — nhận diện qua lực lượng chủ trì (`FEE_COLLECTOR`) trong siêu
 * dữ liệu bước, đúng như `WorkflowRoute.isFeeStep`. Định danh là mã ASCII trong tập đóng, không dò nhãn.
 */
export function isFeeStepCode(stepCode: string): boolean {
  return workflowStepMetadata(stepCode)?.agencyCode === FEE_STEP_AGENCY_CODE;
}

/**
 * Hồ sơ đã **tới bước thu phí** chưa (điều kiện được ghi/xác nhận giao dịch phí — quyết định của chủ
 * dự án). "Đã tới" = trong phiên xử lý liên ngành, bước phí là bước hiện hành **hoặc** đã đi qua:
 *
 *   1. bước phí đã `COMPLETED`; hoặc
 *   2. bước phí đúng là `currentStepCode`; hoặc
 *   3. bước hiện hành có thứ tự (`order`) ≥ thứ tự bước phí.
 *
 * Chưa tới (bước phí còn ở tương lai) hoặc lộ trình không có bước phí → **false** (fail-closed). Hồ sơ
 * chưa có phiên (nháp/chưa nộp) được xử lý ở tầng adapter: không có phiên nghĩa là chưa tới.
 */
export function hasReachedFeeStep(instance: WorkflowInstance): boolean {
  const feeStep = instance.steps.find((step) => isFeeStepCode(step.stepCode));
  if (!feeStep) return false;
  if (feeStep.status === WorkflowStepStatus.COMPLETED) return true;
  if (instance.currentStepCode === feeStep.stepCode) return true;
  const current = instance.currentStep;
  return current ? current.order >= feeStep.order : false;
}

/** CR29 — phiên có **thật sự** chứa bước thu phí không (nguồn "đóng băng" cờ `fee.enabled` của phiên). */
export function instanceIncludesFeeStep(instance: WorkflowInstance): boolean {
  return instance.steps.some((step) => isFeeStepCode(step.stepCode));
}

/**
 * CR29 — **lộ trình hiệu lực** cho một phiên: khớp với tập bước đã đóng băng của phiên. Phiên được mở
 * lúc cờ `fee.enabled` tắt thì không có bước thu phí; lộ trình dựng lại từ DB (luôn có đủ bước) phải
 * được **cắt bớt bước thu phí** để tiến trình/điều kiện mở cổng nhất quán với phiên (không đòi bước phí
 * đã bị bỏ). Phiên có bước phí thì trả nguyên lộ trình.
 */
export function effectiveRouteForInstance(route: WorkflowRoute, instance: WorkflowInstance): WorkflowRoute {
  return instanceIncludesFeeStep(instance) ? route : route.withoutFeeSteps();
}
