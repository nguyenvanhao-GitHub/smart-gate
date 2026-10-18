import { PaginatedResult } from '../../../../common/http/pagination';
import { parseFilterEndDate, parseFilterStartDate } from '../../../../common/time/vietnam-date';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { DeclarationStatus, DeclarationType, WorkflowStepCode } from '../../../declarations/domain/declaration.enums';
import { QueueTab, WorkflowDecision } from '../../domain/workflow.enums';
import { WorkflowInstance } from '../../domain/workflow-instance.entity';
import { WorkflowQueueCriteria, WorkflowQueueRow } from '../ports/workflow-instance.repository';
import { WorkflowRouteService } from '../services/workflow-route.service';
import {
  FakeStepDirectory,
  InMemoryWorkflowInstanceRepository,
  makeAgencyAccess,
  makeQueueDossierRow,
  makeRoute,
} from '../../testing/workflow.fixture';
import { ListWorkflowQueueUseCase } from './list-workflow-queue.use-case';

/**
 * Hàng đợi liên ngành (UI-06) — lọc theo khoảng ngày (F20, BUG-042).
 *
 * Khóa bất biến: use-case nhận `from`/`to` dạng chuỗi rồi chuyển sang `Date` và **chuyển tiếp**
 * xuống kho dữ liệu; không truyền thì tiêu chí bỏ trống (kho tự bỏ điều kiện ngày).
 */
describe('ListWorkflowQueueUseCase — lọc khoảng ngày (F20)', () => {
  class RecordingInstanceRepository {
    lastCriteria: WorkflowQueueCriteria | null = null;

    async findQueue(criteria: WorkflowQueueCriteria): Promise<PaginatedResult<WorkflowQueueRow>> {
      this.lastCriteria = criteria;
      return { items: [], total: 0, page: criteria.page ?? 1, pageSize: criteria.pageSize ?? 20 };
    }

    // Các phương thức còn lại của cổng không dùng trong use-case này.
    async findByDossierId(): Promise<never> {
      throw new Error('not used');
    }
    async save(): Promise<never> {
      throw new Error('not used');
    }
    async appendAction(): Promise<void> {
      /* not used */
    }
    async findActionsByDossierId(): Promise<never[]> {
      return [];
    }
  }

  const routes = new WorkflowRouteService(new FakeStepDirectory());
  const scope = new DossierScopeService(new DataScopeService());

  function buildUseCase(repo: RecordingInstanceRepository): ListWorkflowQueueUseCase {
    return new ListWorkflowQueueUseCase(repo, routes, scope);
  }

  it('chuyển from/to (chuỗi) thành Date và chuyển tiếp xuống kho dữ liệu', async () => {
    const repo = new RecordingInstanceRepository();
    const useCase = buildUseCase(repo);

    await useCase.execute({
      access: makeAgencyAccess('BORDER_GUARD'),
      tab: QueueTab.TODO,
      from: '2026-07-01',
      to: '2026-07-31',
    });

    expect(repo.lastCriteria?.from).toEqual(parseFilterStartDate('2026-07-01'));
    expect(repo.lastCriteria?.to).toEqual(parseFilterEndDate('2026-07-31'));
  });

  it('không truyền from/to thì tiêu chí để trống (không lọc ngày)', async () => {
    const repo = new RecordingInstanceRepository();
    const useCase = buildUseCase(repo);

    await useCase.execute({ access: makeAgencyAccess('BORDER_GUARD'), tab: QueueTab.TODO });

    expect(repo.lastCriteria?.from).toBeUndefined();
    expect(repo.lastCriteria?.to).toBeUndefined();
  });
});

/**
 * CR44 — hàng đợi của cụm nghiệp vụ song song. Một hồ sơ đã qua cổng vào mở cùng lúc ba bước Biên
 * phòng / Kiểm dịch / Hải quan, nên phải xuất hiện trong tab "cần xử lý" của **cả ba** lực lượng, còn
 * cơ quan thu phí (bước còn PENDING) thì chưa thấy.
 *
 * Cách phủ: **không có khuôn integration DB thật** (không testcontainers/pg-mem trong repo), nên nâng
 * `InMemoryWorkflowInstanceRepository.findQueue` mô phỏng đúng điều kiện `EXISTS` trên
 * `workflow_instance_steps` của repository TypeORM ("có bước mở của vai trò thì vào hàng đợi vai trò
 * đó"), rồi chạy chính `ListWorkflowQueueUseCase` để khẳng định ngữ nghĩa cụm song song.
 */
describe('ListWorkflowQueueUseCase — cụm nghiệp vụ song song vào hàng đợi cả 3 lực lượng (CR44)', () => {
  const routes = new WorkflowRouteService(new FakeStepDirectory());
  const scope = new DossierScopeService(new DataScopeService());
  const startedAt = new Date('2026-07-22T08:00:00.000Z');

  /** Repo có sẵn một hồ sơ nhập đã qua cổng vào → cả cụm nghiệp vụ mở song song. */
  function repoWithClusterDossier(): InMemoryWorkflowInstanceRepository {
    const route = makeRoute(DeclarationType.IMPORT);
    const instance = WorkflowInstance.start('hs-cum', DeclarationType.IMPORT, route, startedAt);
    instance.completeGateStep(route, false, 'canbo-cong', 'Cổng vào', startedAt);

    const repo = new InMemoryWorkflowInstanceRepository();
    repo.rows.set(instance.dossierId, instance);
    repo.dossiers.set(
      'hs-cum',
      makeQueueDossierRow({ id: 'hs-cum', type: DeclarationType.IMPORT, status: DeclarationStatus.BUSINESS_PROCESSING }),
    );
    return repo;
  }

  it('cùng một hồ sơ hiện trong tab "cần xử lý" của cả Biên phòng, Kiểm dịch và Hải quan', async () => {
    const repo = repoWithClusterDossier();
    const useCase = new ListWorkflowQueueUseCase(repo, routes, scope);

    for (const roleCode of ['BORDER_GUARD', 'QUARANTINE', 'CUSTOMS']) {
      const page = await useCase.execute({ access: makeAgencyAccess(roleCode), tab: QueueTab.TODO });
      expect(page.total).toBe(1);
      expect(page.items.map((item) => item.dossierId)).toEqual(['hs-cum']);
    }
  });

  it('cơ quan thu phí chưa thấy hồ sơ vì bước thu phí còn PENDING (cụm chưa xong)', async () => {
    const repo = repoWithClusterDossier();
    const useCase = new ListWorkflowQueueUseCase(repo, routes, scope);

    const page = await useCase.execute({ access: makeAgencyAccess('FEE_COLLECTOR'), tab: QueueTab.TODO });

    expect(page.total).toBe(0);
  });

  it('yêu cầu bổ sung một bước trong cụm chỉ đưa hồ sơ vào tab "chờ bổ sung" của đúng lực lượng đó', async () => {
    const route = makeRoute(DeclarationType.IMPORT);
    const instance = WorkflowInstance.start('hs-cum', DeclarationType.IMPORT, route, startedAt);
    instance.completeGateStep(route, false, 'canbo-cong', 'Cổng vào', startedAt);
    instance.applyDecision(
      {
        stepCode: WorkflowStepCode.IMPORT_BORDER,
        decision: WorkflowDecision.REQUEST_SUPPLEMENT,
        actorId: 'u',
        actorName: null,
        reasonCode: null,
        reasonNote: 'Bổ sung chứng từ',
        at: startedAt,
      },
      route,
    );
    const repo = new InMemoryWorkflowInstanceRepository();
    repo.rows.set(instance.dossierId, instance);
    repo.dossiers.set(
      'hs-cum',
      makeQueueDossierRow({ id: 'hs-cum', type: DeclarationType.IMPORT, status: DeclarationStatus.BUSINESS_PROCESSING }),
    );
    const useCase = new ListWorkflowQueueUseCase(repo, routes, scope);

    // Biên phòng thấy hồ sơ ở tab "chờ bổ sung"; Kiểm dịch (còn IN_PROGRESS) thì không.
    expect((await useCase.execute({ access: makeAgencyAccess('BORDER_GUARD'), tab: QueueTab.WAITING })).total).toBe(1);
    expect((await useCase.execute({ access: makeAgencyAccess('QUARANTINE'), tab: QueueTab.WAITING })).total).toBe(0);
    // Kiểm dịch + Hải quan vẫn ở tab "cần xử lý" (bước của họ còn mở IN_PROGRESS).
    expect((await useCase.execute({ access: makeAgencyAccess('QUARANTINE'), tab: QueueTab.TODO })).total).toBe(1);
    expect((await useCase.execute({ access: makeAgencyAccess('CUSTOMS'), tab: QueueTab.TODO })).total).toBe(1);
  });

  it('xử lý xong một bước trong cụm sẽ đưa hồ sơ vào tab "đã xử lý" của chính lực lượng đó', async () => {
    const route = makeRoute(DeclarationType.IMPORT);
    const instance = WorkflowInstance.start('hs-done-step', DeclarationType.IMPORT, route, startedAt);
    instance.completeGateStep(route, false, 'canbo-cong', 'Cổng vào', startedAt);
    // Kiểm dịch hoàn thành bước
    instance.applyDecision(
      {
        stepCode: WorkflowStepCode.IMPORT_QUARANTINE,
        decision: WorkflowDecision.APPROVE,
        actorId: 'u-kd',
        actorName: 'Cán bộ kiểm dịch',
        reasonCode: null,
        reasonNote: null,
        at: startedAt,
      },
      route,
    );
    const repo = new InMemoryWorkflowInstanceRepository();
    repo.rows.set(instance.dossierId, instance);
    repo.dossiers.set(
      'hs-done-step',
      makeQueueDossierRow({ id: 'hs-done-step', type: DeclarationType.IMPORT, status: DeclarationStatus.BUSINESS_PROCESSING }),
    );
    const useCase = new ListWorkflowQueueUseCase(repo, routes, scope);

    // Kiểm dịch thấy ở tab "đã xử lý", Biên phòng chưa thấy ở tab "đã xử lý" (vẫn ở "cần xử lý")
    expect((await useCase.execute({ access: makeAgencyAccess('QUARANTINE'), tab: QueueTab.DONE })).total).toBe(1);
    expect((await useCase.execute({ access: makeAgencyAccess('BORDER_GUARD'), tab: QueueTab.DONE })).total).toBe(0);
    expect((await useCase.execute({ access: makeAgencyAccess('BORDER_GUARD'), tab: QueueTab.TODO })).total).toBe(1);
  });

  it('tài khoản Admin hiển thị đúng 03 tab theo tổng thể 03 lực lượng', async () => {
    const route = makeRoute(DeclarationType.IMPORT);
    const instance = WorkflowInstance.start('hs-admin', DeclarationType.IMPORT, route, startedAt);
    instance.completeGateStep(route, false, 'canbo-cong', 'Cổng vào', startedAt);
    // Duyệt 2/3 lực lượng (Kiểm dịch + Hải quan), còn Biên phòng chưa xong
    instance.applyDecision(
      { stepCode: WorkflowStepCode.IMPORT_QUARANTINE, decision: WorkflowDecision.APPROVE, actorId: 'u-kd', actorName: null, reasonCode: null, reasonNote: null, at: startedAt },
      route,
    );
    instance.applyDecision(
      { stepCode: WorkflowStepCode.IMPORT_CUSTOMS, decision: WorkflowDecision.APPROVE, actorId: 'u-hq', actorName: null, reasonCode: null, reasonNote: null, at: startedAt },
      route,
    );

    const repo = new InMemoryWorkflowInstanceRepository();
    repo.rows.set(instance.dossierId, instance);
    repo.dossiers.set(
      'hs-admin',
      makeQueueDossierRow({ id: 'hs-admin', type: DeclarationType.IMPORT, status: DeclarationStatus.BUSINESS_PROCESSING }),
    );
    const useCase = new ListWorkflowQueueUseCase(repo, routes, scope);
    const adminAccess = makeAgencyAccess('SYS_ADMIN');

    // Admin thấy hồ sơ ở tab "cần xử lý" (vì 2/3 lực lượng xong nhưng còn 1 lực lượng chưa xong)
    expect((await useCase.execute({ access: adminAccess, tab: QueueTab.TODO })).total).toBe(1);
    expect((await useCase.execute({ access: adminAccess, tab: QueueTab.DONE })).total).toBe(0);

    // Khi cả 3 lực lượng duyệt xong -> Admin mới thấy ở tab "đã xử lý"
    instance.applyDecision(
      { stepCode: WorkflowStepCode.IMPORT_BORDER, decision: WorkflowDecision.APPROVE, actorId: 'u-bp', actorName: null, reasonCode: null, reasonNote: null, at: startedAt },
      route,
    );
    expect((await useCase.execute({ access: adminAccess, tab: QueueTab.TODO })).total).toBe(0);
    expect((await useCase.execute({ access: adminAccess, tab: QueueTab.DONE })).total).toBe(1);
  });
});
