import { DeclarationStatus } from '../../../modules/declarations/domain/declaration.enums';
import { stepPrefixForType, workflowStepMetadata } from '../../../modules/declarations/domain/workflow-step.catalog';
import { WorkflowInstanceStatus, WorkflowStepStatus } from '../../../modules/workflow/domain/workflow.enums';

/**
 * Đọc cột `declarations.workflowProgress` (jsonb) để dựng phiên xử lý liên ngành trong bảng quan hệ.
 *
 * Tách khỏi tệp migration để **test được không cần cơ sở dữ liệu** — cùng cách làm với
 * `dossier-jsonb-backfill.ts` của P2 (rủi ro **R2**: di trú làm hỏng hồ sơ đang có).
 *
 * ⚠️ Giới hạn đã biết, cố ý ghi rõ thay vì giấu: cột `jsonb` cũ **không lưu mốc thời gian theo từng
 * bước**, nên `entered_at`/`completed_at` của hồ sơ cũ chỉ là **xấp xỉ** (mốc gửi hồ sơ và mốc hoạt
 * động cuối trong `auditTrail`). Số liệu F26 của hồ sơ cũ vì thế là tham khảo; hồ sơ phát sinh sau
 * P3 mới có mốc thật.
 */

export interface LegacyWorkflowRow {
  id: string;
  type: string;
  status: string;
  workflowProgress: unknown;
  auditTrail: unknown;
  submittedAt: Date | string | null;
  createdAt: Date | string;
}

/** Một dòng của bảng `workflow_step_roles` (hoặc của danh mục seed khi bảng còn rỗng). */
export interface StepOrderRow {
  stepCode: string;
  sortOrder: number;
}

export interface StepPlan {
  stepCode: string;
  order: number;
  status: WorkflowStepStatus;
  enteredAt: Date | null;
  completedAt: Date | null;
}

export interface InstancePlan {
  dossierId: string;
  dossierType: string;
  currentStepCode: string | null;
  status: WorkflowInstanceStatus;
  startedAt: Date;
  completedAt: Date | null;
  steps: StepPlan[];
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Các bước của một luồng, đã sắp thứ tự và loại bỏ mã bước không có siêu dữ liệu (dữ liệu rác). */
export function orderedStepsFor(type: string, stepOrders: StepOrderRow[]): Array<{ stepCode: string; order: number }> {
  const prefix = stepPrefixForType(type as never);
  const byStep = new Map<string, number>();
  stepOrders
    .filter((row) => row.stepCode.startsWith(prefix) && !!workflowStepMetadata(row.stepCode))
    .forEach((row) => {
      const current = byStep.get(row.stepCode);
      byStep.set(row.stepCode, current === undefined ? row.sortOrder : Math.min(current, row.sortOrder));
    });

  return [...byStep.entries()]
    .map(([stepCode, order]) => ({ stepCode, order }))
    .sort((left, right) => (left.order === right.order ? left.stepCode.localeCompare(right.stepCode) : left.order - right.order));
}

/** Mốc hoạt động cuối cùng trong `auditTrail`; không có thì null. */
export function lastActivityAt(row: LegacyWorkflowRow): Date | null {
  const entries = Array.isArray(row.auditTrail) ? row.auditTrail : [];
  const dates = entries
    .map((entry) => asDate(asObject(entry).at))
    .filter((date): date is Date => !!date)
    .sort((left, right) => right.getTime() - left.getTime());
  return dates[0] ?? null;
}

/**
 * Dựng phiên cho một hồ sơ. Trả `null` với hồ sơ **chưa vào quy trình** (nháp) hoặc **đã hủy** —
 * cố ý không tạo phiên rỗng, vì phiên rỗng lọt qua mắt người kiểm tra còn tệ hơn là không có.
 */
export function buildInstancePlan(row: LegacyWorkflowRow, stepOrders: StepOrderRow[]): InstancePlan | null {
  if (row.status === DeclarationStatus.DRAFT || row.status === DeclarationStatus.CANCELLED) return null;

  const steps = orderedStepsFor(row.type, stepOrders);
  if (steps.length === 0) return null;

  const startedAt = asDate(row.submittedAt) ?? asDate(row.createdAt) ?? new Date();
  const lastAt = lastActivityAt(row) ?? startedAt;
  const progress = asObject(row.workflowProgress);
  const isCompleted = (stepCode: string): boolean => {
    const metadata = workflowStepMetadata(stepCode);
    // Bước khai báo coi như xong ngay khi hồ sơ rời trạng thái nháp.
    if (metadata?.agencyCode === 'ENTERPRISE') return true;
    return progress[stepCode] === 'COMPLETED';
  };

  const pending = steps.find((step) => !isCompleted(step.stepCode));
  const currentStepCode = pending?.stepCode ?? null;

  const instanceStatus = ((): WorkflowInstanceStatus => {
    if (row.status === DeclarationStatus.REJECTED) return WorkflowInstanceStatus.REJECTED;
    if (row.status === DeclarationStatus.REVISION_REQUIRED) return WorkflowInstanceStatus.WAITING_SUPPLEMENT;
    return currentStepCode ? WorkflowInstanceStatus.IN_PROGRESS : WorkflowInstanceStatus.COMPLETED;
  })();

  const stepPlans: StepPlan[] = steps.map((step) => {
    if (isCompleted(step.stepCode)) {
      return {
        stepCode: step.stepCode,
        order: step.order,
        status: WorkflowStepStatus.COMPLETED,
        enteredAt: startedAt,
        completedAt: lastAt,
      };
    }
    if (step.stepCode !== currentStepCode) {
      return { stepCode: step.stepCode, order: step.order, status: WorkflowStepStatus.PENDING, enteredAt: null, completedAt: null };
    }
    const status =
      instanceStatus === WorkflowInstanceStatus.REJECTED
        ? WorkflowStepStatus.REJECTED
        : instanceStatus === WorkflowInstanceStatus.WAITING_SUPPLEMENT
          ? WorkflowStepStatus.WAITING_SUPPLEMENT
          : WorkflowStepStatus.IN_PROGRESS;
    return {
      stepCode: step.stepCode,
      order: step.order,
      status,
      enteredAt: lastAt,
      completedAt: status === WorkflowStepStatus.REJECTED ? lastAt : null,
    };
  });

  return {
    dossierId: row.id,
    dossierType: row.type,
    currentStepCode,
    status: instanceStatus,
    startedAt,
    completedAt:
      instanceStatus === WorkflowInstanceStatus.COMPLETED || instanceStatus === WorkflowInstanceStatus.REJECTED
        ? lastAt
        : null,
    steps: stepPlans,
  };
}

export interface WorkflowBackfillExpectation {
  dossiers: number;
  instances: number;
  steps: number;
  /** Hồ sơ nháp/đã hủy — cố ý không tạo phiên. */
  skipped: number;
  completed: number;
}

export function computeWorkflowExpectation(
  rows: LegacyWorkflowRow[],
  stepOrders: StepOrderRow[],
): WorkflowBackfillExpectation {
  const plans = rows.map((row) => buildInstancePlan(row, stepOrders)).filter((plan): plan is InstancePlan => !!plan);
  return {
    dossiers: rows.length,
    instances: plans.length,
    steps: plans.reduce((total, plan) => total + plan.steps.length, 0),
    skipped: rows.length - plans.length,
    completed: plans.filter((plan) => plan.status === WorkflowInstanceStatus.COMPLETED).length,
  };
}
