import { WORKFLOW_STEP_ROLE_CATALOG } from '../../../modules/access-control/domain/workflow-step-role.catalog';
import { DeclarationStatus, DeclarationType, WorkflowStepCode } from '../../../modules/declarations/domain/declaration.enums';
import { WorkflowInstanceStatus, WorkflowStepStatus } from '../../../modules/workflow/domain/workflow.enums';
import {
  LegacyWorkflowRow,
  StepOrderRow,
  buildInstancePlan,
  computeWorkflowExpectation,
  lastActivityAt,
  orderedStepsFor,
} from './workflow-progress-backfill';

/**
 * Di trú `declarations.workflowProgress` (jsonb) → bảng quan hệ. Không có database thật để thử nên
 * phần rủi ro nhất (đọc jsonb hỏng, suy ra bước hiện tại) được khoá bằng test thuần — cùng cách
 * `dossier-jsonb-backfill.spec.ts` của P2 làm.
 */
describe('workflow-progress-backfill', () => {
  const stepOrders: StepOrderRow[] = WORKFLOW_STEP_ROLE_CATALOG.map((item) => ({
    stepCode: item.stepCode,
    sortOrder: item.sortOrder,
  }));

  const row = (overrides: Partial<LegacyWorkflowRow> = {}): LegacyWorkflowRow => ({
    id: 'decl-01',
    type: DeclarationType.IMPORT,
    status: DeclarationStatus.PROCESSING,
    workflowProgress: {},
    auditTrail: [],
    submittedAt: '2026-07-20T08:00:00.000Z',
    createdAt: '2026-07-20T07:00:00.000Z',
    ...overrides,
  });

  describe('orderedStepsFor', () => {
    it('lọc đúng bộ bước theo luồng và sắp theo sort_order', () => {
      expect(orderedStepsFor(DeclarationType.IMPORT, stepOrders).map((step) => step.stepCode)).toEqual([
        WorkflowStepCode.IMPORT_DECLARED,
        WorkflowStepCode.IMPORT_B1_ENTRY,
        WorkflowStepCode.IMPORT_BORDER,
        WorkflowStepCode.IMPORT_QUARANTINE,
        WorkflowStepCode.IMPORT_CUSTOMS,
        WorkflowStepCode.IMPORT_FEE,
        WorkflowStepCode.IMPORT_B2_EXIT,
      ]);
    });

    it('bỏ mã bước không có siêu dữ liệu (dữ liệu rác trong bảng cấu hình)', () => {
      const withGarbage = [...stepOrders, { stepCode: 'IMPORT_KHONG_CO_THAT', sortOrder: 2 }];
      expect(orderedStepsFor(DeclarationType.IMPORT, withGarbage)).toHaveLength(7);
    });
  });

  describe('buildInstancePlan', () => {
    it('hồ sơ nháp và hồ sơ đã hủy cố ý KHÔNG sinh phiên', () => {
      expect(buildInstancePlan(row({ status: DeclarationStatus.DRAFT }), stepOrders)).toBeNull();
      expect(buildInstancePlan(row({ status: DeclarationStatus.CANCELLED }), stepOrders)).toBeNull();
    });

    it('hồ sơ vừa gửi, chưa lực lượng nào xác nhận → đứng ở bước xử lý đầu tiên', () => {
      const plan = buildInstancePlan(row({ status: DeclarationStatus.SUBMITTED }), stepOrders);
      expect(plan?.currentStepCode).toBe(WorkflowStepCode.IMPORT_B1_ENTRY);
      expect(plan?.status).toBe(WorkflowInstanceStatus.IN_PROGRESS);
      // Bước khai báo của doanh nghiệp coi như đã xong.
      expect(plan?.steps.find((step) => step.stepCode === WorkflowStepCode.IMPORT_DECLARED)?.status).toBe(
        WorkflowStepStatus.COMPLETED,
      );
    });

    it('suy ra bước hiện tại từ các bước đã COMPLETED trong cột jsonb', () => {
      const plan = buildInstancePlan(
        row({
          workflowProgress: {
            [WorkflowStepCode.IMPORT_DECLARED]: 'COMPLETED',
            [WorkflowStepCode.IMPORT_B1_ENTRY]: 'COMPLETED',
            [WorkflowStepCode.IMPORT_BORDER]: 'COMPLETED',
          },
        }),
        stepOrders,
      );
      expect(plan?.currentStepCode).toBe(WorkflowStepCode.IMPORT_QUARANTINE);
      expect(plan?.steps.filter((step) => step.status === WorkflowStepStatus.COMPLETED)).toHaveLength(3);
      expect(plan?.steps.filter((step) => step.status === WorkflowStepStatus.PENDING)).toHaveLength(3);
    });

    it('mọi bước đã xong → phiên hoàn tất, không còn bước hiện tại', () => {
      const progress: Record<string, string> = {};
      orderedStepsFor(DeclarationType.IMPORT, stepOrders).forEach((step) => {
        progress[step.stepCode] = 'COMPLETED';
      });
      const plan = buildInstancePlan(row({ workflowProgress: progress }), stepOrders);
      expect(plan?.currentStepCode).toBeNull();
      expect(plan?.status).toBe(WorkflowInstanceStatus.COMPLETED);
      expect(plan?.completedAt).not.toBeNull();
    });

    it('hồ sơ REVISION_REQUIRED chuyển thành phiên chờ bổ sung, hồ sơ REJECTED thành phiên bị từ chối', () => {
      expect(buildInstancePlan(row({ status: DeclarationStatus.REVISION_REQUIRED }), stepOrders)?.status).toBe(
        WorkflowInstanceStatus.WAITING_SUPPLEMENT,
      );
      expect(buildInstancePlan(row({ status: DeclarationStatus.REJECTED }), stepOrders)?.status).toBe(
        WorkflowInstanceStatus.REJECTED,
      );
    });

    it('chịu được jsonb hỏng: null, chuỗi, mảng đều không làm vỡ kế hoạch di trú', () => {
      [null, 'hỏng', [1, 2, 3], undefined].forEach((broken) => {
        const plan = buildInstancePlan(row({ workflowProgress: broken, auditTrail: broken }), stepOrders);
        expect(plan?.steps).toHaveLength(7);
        expect(plan?.currentStepCode).toBe(WorkflowStepCode.IMPORT_B1_ENTRY);
      });
    });

    it('thiếu submitted_at thì lùi về createdAt chứ không bịa mốc thời gian', () => {
      const plan = buildInstancePlan(row({ submittedAt: null }), stepOrders);
      expect(plan?.startedAt.toISOString()).toBe('2026-07-20T07:00:00.000Z');
    });

    it('mốc hoạt động cuối lấy từ auditTrail (xấp xỉ cho hồ sơ cũ, đã ghi rõ giới hạn)', () => {
      const source = row({
        auditTrail: [
          { at: '2026-07-20T09:00:00.000Z', action: 'SUBMIT' },
          { at: '2026-07-20T11:30:00.000Z', action: 'OPERATION_ACTION' },
        ],
      });
      expect(lastActivityAt(source)?.toISOString()).toBe('2026-07-20T11:30:00.000Z');
      expect(buildInstancePlan(source, stepOrders)?.steps[0].completedAt?.toISOString()).toBe(
        '2026-07-20T11:30:00.000Z',
      );
    });

    it('luồng xuất dùng bộ bước EXPORT_*', () => {
      const plan = buildInstancePlan(row({ type: DeclarationType.EXPORT }), stepOrders);
      expect(plan?.currentStepCode).toBe(WorkflowStepCode.EXPORT_B2_ENTRY);
    });
  });

  describe('computeWorkflowExpectation — số liệu đối chiếu của migration', () => {
    it('đếm đúng số phiên, số bước và số hồ sơ cố ý bỏ qua', () => {
      const rows = [
        row({ id: 'd1', status: DeclarationStatus.DRAFT }),
        row({ id: 'd2', status: DeclarationStatus.CANCELLED }),
        row({ id: 'd3', status: DeclarationStatus.SUBMITTED }),
        row({ id: 'd4', type: DeclarationType.EXPORT, status: DeclarationStatus.PROCESSING }),
      ];
      const expectation = computeWorkflowExpectation(rows, stepOrders);
      expect(expectation).toEqual({ dossiers: 4, instances: 2, steps: 14, skipped: 2, completed: 0 });
    });

    it('không có hồ sơ nào thì mọi số liệu bằng 0', () => {
      expect(computeWorkflowExpectation([], stepOrders)).toEqual({
        dossiers: 0,
        instances: 0,
        steps: 0,
        skipped: 0,
        completed: 0,
      });
    });
  });
});
