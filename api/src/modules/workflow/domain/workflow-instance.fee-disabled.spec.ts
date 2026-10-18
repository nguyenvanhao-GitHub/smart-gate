import { DeclarationType } from '../../declarations/domain/declaration.enums';
import { makeRoute } from '../testing/workflow.fixture';
import { effectiveRouteForInstance, instanceIncludesFeeStep } from './fee-step-gate.rules';
import { WorkflowInstance } from './workflow-instance.entity';
import { FEE_STEP_AGENCY_CODE, WorkflowStage } from './workflow-route';
import { WorkflowDecision, WorkflowInstanceStatus } from './workflow.enums';

/**
 * CR29 — cờ Thu phí chung tắt: phiên được mở trên **lộ trình đã bỏ bước Thu phí** (`withoutFeeSteps`).
 * Kiểm hai điều cốt lõi ở tầng domain (không cần DB):
 *   1. lộ trình rút gọn không còn giai đoạn/bước thu phí;
 *   2. cụm nghiệp vụ xong đi **thẳng sang cổng ra**, không kẹt ở giai đoạn thu phí rỗng.
 */
describe('WorkflowInstance — luồng khi tắt Thu phí (CR29)', () => {
  const AT = new Date('2026-07-22T08:00:00.000Z');

  it('withoutFeeSteps() loại hẳn bước/giai đoạn thu phí khỏi lộ trình', () => {
    const feeless = makeRoute(DeclarationType.EXPORT).withoutFeeSteps();

    expect(feeless.steps.some((step) => step.agencyCode === FEE_STEP_AGENCY_CODE)).toBe(false);
    expect(feeless.stagesInOrder).not.toContain(WorkflowStage.FEE);
  });

  it('cụm nghiệp vụ hoàn thành thì mở thẳng cổng ra, không có bước thu phí', () => {
    const feeless = makeRoute(DeclarationType.EXPORT).withoutFeeSteps();
    const instance = WorkflowInstance.start('decl-no-fee', DeclarationType.EXPORT, feeless, AT);

    // Xe qua cổng vào → mở cụm nghiệp vụ.
    instance.completeGateStep(feeless, false, 'user-gate', 'Cổng vào', AT);

    const inspectionSteps = feeless.actionableSteps.filter((step) => !feeless.isGateStep(step.code));
    for (const step of inspectionSteps) {
      instance.applyDecision(
        { stepCode: step.code, decision: WorkflowDecision.APPROVE, actorId: 'u', actorName: null, reasonCode: null, reasonNote: null, at: AT },
        feeless,
      );
    }

    expect(instanceIncludesFeeStep(instance)).toBe(false);
    // Giai đoạn kế sau cụm nghiệp vụ là cổng ra (không phải thu phí) → phiên đứng ở bước cổng ra.
    const current = instance.currentStep;
    expect(current).toBeDefined();
    expect(feeless.stageOf(current!.stepCode)).toBe(WorkflowStage.EXIT_GATE);
    expect(instance.status).toBe(WorkflowInstanceStatus.IN_PROGRESS);

    // Xe qua cổng ra → phiên hoàn tất.
    instance.completeGateStep(feeless, false, 'user-gate', 'Cổng ra', AT);
    expect(instance.status).toBe(WorkflowInstanceStatus.COMPLETED);
  });

  it('effectiveRouteForInstance cắt bước phí theo tập bước đã đóng băng của phiên', () => {
    const fullRoute = makeRoute(DeclarationType.EXPORT);

    const feelessInstance = WorkflowInstance.start('d1', DeclarationType.EXPORT, fullRoute.withoutFeeSteps(), AT);
    const withFeeInstance = WorkflowInstance.start('d2', DeclarationType.EXPORT, fullRoute, AT);

    // Phiên không có bước phí → lộ trình hiệu lực cũng không có bước phí, dù DB vẫn khai đủ.
    expect(effectiveRouteForInstance(fullRoute, feelessInstance).steps.some((s) => s.agencyCode === FEE_STEP_AGENCY_CODE)).toBe(false);
    // Phiên có bước phí → giữ nguyên lộ trình đầy đủ.
    expect(effectiveRouteForInstance(fullRoute, withFeeInstance).steps.some((s) => s.agencyCode === FEE_STEP_AGENCY_CODE)).toBe(true);
  });
});
