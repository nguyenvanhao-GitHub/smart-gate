import { AuditEntryInput, AuditLogger } from '../../../common/audit/audit-logger.port';
import { SettingsReader } from '../../../common/settings/settings-reader.port';
import { UserAccessContext } from '../../../common/auth/access-context';
import { PublishNotificationInput, NotificationPublisher } from '../../../common/notifications/notification-publisher.port';
import { PaginatedResult } from '../../../common/http/pagination';
import { WORKFLOW_STEP_ROLE_CATALOG } from '../../access-control/domain/workflow-step-role.catalog';
import { DataScopeLevel } from '../../access-control/domain/data-scope.enum';
import { ReasonCodeView, ReasonScope } from '../../catalog/domain/reason-code.catalog';
import {
  DeclarationStatus,
  DeclarationType,
  POST_INTERAGENCY_STATUSES,
} from '../../declarations/domain/declaration.enums';
import { ReasonCodeCatalogPort } from '../application/ports/reason-code.port';
import { WorkflowActor, WorkflowActorDirectory } from '../application/ports/workflow-actor.port';
import {
  ChecklistDefinition,
  ChecklistState,
  WorkflowChecklistCatalog,
  WorkflowChecklistRepository,
} from '../application/ports/workflow-checklist.port';
import {
  QueueDossierRow,
  WorkflowInstanceRepository,
  WorkflowQueueCriteria,
  WorkflowQueueRow,
} from '../application/ports/workflow-instance.repository';
import { WorkflowStepDirectory } from '../application/ports/workflow-step-directory.port';
import { AgencyAction } from '../domain/agency-action.entity';
import { QueueTab, WorkflowDecision, WorkflowInstanceStatus, WorkflowStepStatus } from '../domain/workflow.enums';
import { WorkflowInstance } from '../domain/workflow-instance.entity';
import { WorkflowRoute, WorkflowStepRoleRow, buildWorkflowRoute } from '../domain/workflow-route';

/**
 * Bộ dữ liệu dựng sẵn cho test phân hệ workflow — KHÔNG dùng trong mã sản phẩm.
 * Nguồn thứ tự bước lấy đúng danh mục seed của `workflow_step_roles`, nên test kiểm chính cấu hình
 * sẽ chạy trên môi trường thật chứ không phải một bảng bịa riêng cho test.
 */
export function seedStepRoleRows(): WorkflowStepRoleRow[] {
  return WORKFLOW_STEP_ROLE_CATALOG.map((item) => ({
    stepCode: item.stepCode,
    roleCode: item.roleCode,
    sortOrder: item.sortOrder,
    force: item.force,
  }));
}

export function makeRoute(type: DeclarationType): WorkflowRoute {
  return buildWorkflowRoute(type, seedStepRoleRows());
}

/**
 * Phiên xử lý đã được **duyệt (APPROVE)** qua một số bước liên ngành đầu tiên — dùng cho test điều
 * kiện mở cổng. `approvedBusinessSteps` là số bước xử lý (không tính bước khai báo, không tính bước
 * cổng) đã duyệt xong; mặc định duyệt hết mọi bước trước bước cổng (hồ sơ đã sẵn sàng ra cổng).
 * Dùng chính `applyDecision` của domain nên trạng thái phiên/ bước đúng như luồng thật.
 */
export function makeApprovedInstance(
  dossierId: string,
  type: DeclarationType,
  approvedBusinessSteps?: number,
  at: Date = new Date('2026-07-22T08:00:00.000Z'),
): WorkflowInstance {
  const route = makeRoute(type);
  const instance = WorkflowInstance.start(dossierId, type, route, at);
  // Bước cổng VÀO (Biên phòng xác nhận xe vào, CR7) do sự kiện cổng khép — mô phỏng bằng
  // `completeGateStep` để phiên tiến tới bước kiểm tra liên ngành đầu tiên.
  const entry = instance.currentStepCode;
  if (entry && route.gateDirectionOf(entry) === 'ENTRY') {
    instance.completeGateStep(route, false, 'user-gate', 'Cổng vào', at);
  }
  const businessSteps = route.actionableSteps.filter((step) => !route.isGateStep(step.code));
  const count = approvedBusinessSteps ?? businessSteps.length;
  for (const step of businessSteps.slice(0, count)) {
    instance.applyDecision(
      { stepCode: step.code, decision: WorkflowDecision.APPROVE, actorId: 'user-test', actorName: 'Cán bộ kiểm tra', reasonCode: null, reasonNote: null, at },
      route,
    );
  }
  return instance;
}

export class FakeStepDirectory implements WorkflowStepDirectory {
  constructor(private readonly rows: WorkflowStepRoleRow[] = seedStepRoleRows()) {}

  async listStepRoles(): Promise<WorkflowStepRoleRow[]> {
    return this.rows;
  }
}

/**
 * Cổng đọc cấu hình giả lập cho test (CR29). Không seed gì → `getValue` trả `null`, các consumer tự
 * rơi về mặc định (vd `fee.enabled` mặc định BẬT). Seed `{ 'fee.enabled': 'false' }` để mô phỏng tắt phí.
 */
export class FakeSettingsReader implements SettingsReader {
  constructor(private readonly values: Record<string, string> = {}) {}

  async getValue(key: string): Promise<string | null> {
    return this.values[key] ?? null;
  }
}

/** Quyền hiệu lực giả lập cho lực lượng chuyên ngành: phạm vi ALL để không vướng lọc dữ liệu. */
export function makeAgencyAccess(roleCode: string, permissions: string[] = ['workflow.view', 'workflow.approve', 'workflow.update']): UserAccessContext {
  return {
    userId: `user-${roleCode.toLowerCase()}`,
    roles: [{ code: roleCode, name: roleCode, dataScope: DataScopeLevel.ALL }],
    permissions,
    assignments: [],
  };
}

/** Dữ liệu hồ sơ tối thiểu để dựng một dòng hàng đợi trong bộ nhớ. */
export function makeQueueDossierRow(overrides: Partial<QueueDossierRow> = {}): QueueDossierRow {
  const now = new Date('2026-07-22T08:00:00.000Z');
  return {
    id: overrides.id ?? 'decl-01',
    code: overrides.code ?? 'CK-2026-0001',
    type: overrides.type ?? DeclarationType.IMPORT,
    status: overrides.status ?? DeclarationStatus.BUSINESS_PROCESSING,
    epidemicFlag: overrides.epidemicFlag ?? false,
    enterpriseTaxCode: overrides.enterpriseTaxCode ?? '5500123456',
    enterpriseName: overrides.enterpriseName ?? 'Công ty TNHH Chiềng Khương',
    plateNumber: overrides.plateNumber ?? '26C-123.45',
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    submittedAt: overrides.submittedAt ?? now,
  };
}

export class InMemoryWorkflowInstanceRepository implements WorkflowInstanceRepository {
  readonly rows = new Map<string, WorkflowInstance>();
  readonly actions: AgencyAction[] = [];
  /**
   * Dữ liệu hồ sơ tối thiểu cho `findQueue`. Chỉ cần seed khi test hàng đợi; phần lớn test khác chỉ
   * dùng `rows`/`actions`. Tách khỏi `rows` vì phiên chỉ được ghi khi có quyết định đầu tiên, còn hồ
   * sơ vẫn phải vào hàng đợi ngay khi vừa gửi (chưa có phiên).
   */
  readonly dossiers = new Map<string, QueueDossierRow>();

  async findByDossierId(dossierId: string): Promise<WorkflowInstance | null> {
    return this.rows.get(dossierId) ?? null;
  }

  async save(instance: WorkflowInstance): Promise<WorkflowInstance> {
    this.rows.set(instance.dossierId, instance);
    return instance;
  }

  async appendAction(action: AgencyAction): Promise<void> {
    this.actions.push(action);
  }

  async findActionsByDossierId(dossierId: string): Promise<AgencyAction[]> {
    return this.actions.filter((a) => a.dossierId === dossierId);
  }

  /**
   * CR44 — mô phỏng đúng ngữ nghĩa của `TypeOrmWorkflowInstanceRepository.findQueue` (điều kiện `EXISTS`
   * trên `workflow_instance_steps`): tư cách vào hàng đợi của một lực lượng = **có bước mở của mình**,
   * không theo con trỏ đơn. Nhờ vậy một hồ sơ ở cụm nghiệp vụ song song hiện trong hàng đợi của cả ba
   * lực lượng cùng lúc. Chỉ chạy trên các hồ sơ đã seed vào `dossiers`.
   */
  async findQueue(criteria: WorkflowQueueCriteria): Promise<PaginatedResult<WorkflowQueueRow>> {
    const page = criteria.page ?? 1;
    const pageSize = criteria.pageSize ?? 20;
    const dossiers = [...this.dossiers.values()];
    const countTodo = dossiers.filter((dossier) =>
      this.matchesQueue(dossier, this.rows.get(dossier.id) ?? null, { ...criteria, tab: QueueTab.TODO }),
    ).length;
    const countDone = dossiers.filter((dossier) =>
      this.matchesQueue(dossier, this.rows.get(dossier.id) ?? null, { ...criteria, tab: QueueTab.DONE }),
    ).length;
    const countWaiting = dossiers.filter((dossier) =>
      this.matchesQueue(dossier, this.rows.get(dossier.id) ?? null, { ...criteria, tab: QueueTab.WAITING }),
    ).length;

    const matched = dossiers.filter((dossier) =>
      this.matchesQueue(dossier, this.rows.get(dossier.id) ?? null, criteria),
    );
    const start = (page - 1) * pageSize;
    const items: WorkflowQueueRow[] = matched
      .slice(start, start + pageSize)
      .map((dossier) => ({ instance: this.rows.get(dossier.id) ?? null, dossier }));
    return {
      items,
      total: matched.length,
      page,
      pageSize,
      stats: { todo: countTodo, done: countDone, waiting: countWaiting },
    };
  }

  private matchesQueue(
    dossier: QueueDossierRow,
    instance: WorkflowInstance | null,
    criteria: WorkflowQueueCriteria,
  ): boolean {
    if (dossier.status === DeclarationStatus.DRAFT || dossier.status === DeclarationStatus.CANCELLED) return false;
    if (criteria.type && dossier.type !== criteria.type) return false;
    if (criteria.status && dossier.status !== criteria.status) return false;

    const inspectionCodes = new Set(criteria.inspectionStepCodes ?? []);
    const actionable = new Set(criteria.actionableStepCodes);

    if (criteria.isAdmin) {
      const steps = instance?.steps ?? [];
      const hasUncompletedInspectionStep = steps.some(
        (step) => inspectionCodes.has(step.stepCode) && step.status !== WorkflowStepStatus.COMPLETED,
      );
      const hasWaitingSupplementInspectionStep = steps.some(
        (step) => inspectionCodes.has(step.stepCode) && step.status === WorkflowStepStatus.WAITING_SUPPLEMENT,
      );

      if (criteria.tab === QueueTab.DONE) {
        return (
          POST_INTERAGENCY_STATUSES.includes(dossier.status) ||
          (!!instance && !hasUncompletedInspectionStep)
        );
      }

      if (criteria.tab === QueueTab.WAITING) {
        return (
          dossier.status === DeclarationStatus.REVISION_REQUIRED ||
          (dossier.status as string) === 'NEED_SUPPLEMENT' ||
          hasWaitingSupplementInspectionStep
        );
      }

      return (
        dossier.status === DeclarationStatus.BUSINESS_PROCESSING &&
        (!instance || instance.status === WorkflowInstanceStatus.IN_PROGRESS) &&
        hasUncompletedInspectionStep &&
        !hasWaitingSupplementInspectionStep
      );
    }

    // --- AGENCY ACCOUNT ---
    if (actionable.size === 0) return false;

    const hasStepWithStatus = (status: WorkflowStepStatus): boolean =>
      !!instance && instance.steps.some((step) => actionable.has(step.stepCode) && step.status === status);

    if (criteria.tab === QueueTab.DONE) {
      return hasStepWithStatus(WorkflowStepStatus.COMPLETED);
    }

    if (criteria.tab === QueueTab.WAITING) {
      return hasStepWithStatus(WorkflowStepStatus.WAITING_SUPPLEMENT);
    }

    return (
      dossier.status === DeclarationStatus.BUSINESS_PROCESSING &&
      (!instance || instance.status === WorkflowInstanceStatus.IN_PROGRESS) &&
      hasStepWithStatus(WorkflowStepStatus.IN_PROGRESS)
    );
  }
}

export class InMemoryChecklistRepository implements WorkflowChecklistRepository {
  readonly rows = new Map<string, ChecklistState[]>();

  async listStates(dossierId: string): Promise<ChecklistState[]> {
    return this.rows.get(dossierId) ?? [];
  }

  async upsertStates(dossierId: string, _actorId: string, states: ChecklistState[]): Promise<void> {
    const current = this.rows.get(dossierId) ?? [];
    const merged = new Map(current.map((state) => [state.code, state]));
    states.forEach((state) => merged.set(state.code, state));
    this.rows.set(dossierId, [...merged.values()]);
  }
}

export class FakeChecklistCatalog implements WorkflowChecklistCatalog {
  constructor(private readonly definitions: ChecklistDefinition[] = []) {}

  async listDefinitions(): Promise<ChecklistDefinition[]> {
    return this.definitions;
  }
}

/** Danh mục mã nguyên nhân giả lập. Mặc định có đúng bộ mã tạm đang seed cho bổ sung và từ chối. */
export class FakeReasonCodeCatalog implements ReasonCodeCatalogPort {
  constructor(
    private readonly codes: Record<string, string[]> = {
      [ReasonScope.SUPPLEMENT]: ['BS01', 'BS02'],
      [ReasonScope.REJECT]: ['TC01', 'TC02'],
      [ReasonScope.FEE_ADJUST]: ['DC01'],
    },
  ) {}

  async findActive(scope: ReasonScope, code: string): Promise<ReasonCodeView | null> {
    return (this.codes[scope] ?? []).includes(code) ? { code, name: code, scope, active: true } : null;
  }
}

export class FakeActorDirectory implements WorkflowActorDirectory {
  constructor(private readonly fullName = 'Cán bộ kiểm tra') {}

  async findById(userId: string): Promise<WorkflowActor | null> {
    return { id: userId, fullName: this.fullName };
  }
}

export class FakeAuditLogger implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];

  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

export class FakeNotificationPublisher implements NotificationPublisher {
  readonly published: PublishNotificationInput[] = [];

  async publish(input: PublishNotificationInput): Promise<void> {
    this.published.push(input);
  }
}
