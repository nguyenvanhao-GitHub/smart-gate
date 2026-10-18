import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { DeclarationStatus, DeclarationType, WorkflowStepCode } from '../../../declarations/domain/declaration.enums';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { makeAccess } from '../../../declarations/testing/declaration.fixture';
import { DispatchAssignment, DispatchAssignmentStatus } from '../../domain/dispatch-assignment.entity';
import { InspectionStatus } from '../../domain/inspection-status.rules';
import {
  DispatchAssignmentRepository,
  DispatchAssignmentWithDossier,
  DispatchBoardCriteria,
  DispatchBoardRow,
} from '../ports/dispatch-assignment.repository';
import { GetDispatchBoardUseCase } from './get-dispatch-board.use-case';

const dispatcher = makeAccess({
  userId: 'user-dieu-phoi',
  roles: [{ code: 'DISPATCHER', name: 'Điều phối viên', dataScope: DataScopeLevel.ALL }],
  permissions: ['dispatch.view'],
});

/** Vị trí đang hiệu lực gán đủ khu + ô đỗ — chỉ để chứng minh khung KHÔNG còn phụ thuộc việc gán ô. */
function inYardAssignment(dossierId: string): DispatchAssignment {
  return new DispatchAssignment(
    `assign-${dossierId}`,
    dossierId,
    null,
    null,
    'yard-a',
    'A01',
    DispatchAssignmentStatus.ACTIVE,
    new Date('2026-07-20T08:00:00Z'),
    null,
    'u-1',
    null,
    new Date('2026-07-20T08:00:00Z'),
    InspectionStatus.WAITING_INSPECTION,
    null,
  );
}

/** Một dòng board — mặc định là hồ sơ nhập đang ở bước cổng vào (giai đoạn ENTRY_GATE → Chờ điều phối). */
function makeRow(overrides: Partial<DispatchBoardRow> = {}): DispatchBoardRow {
  return {
    dossierId: 'ho-so-1',
    dossierCode: 'IMP-0001',
    plateNumber: '15C-777.88',
    enterpriseName: 'Cty A',
    dossierStatus: DeclarationStatus.SUBMITTED,
    dossierType: DeclarationType.IMPORT,
    ticketNumber: 1,
    waitingSince: new Date('2026-07-20T07:00:00Z'),
    currentStepCode: WorkflowStepCode.IMPORT_B1_ENTRY,
    activeStepCodes: [WorkflowStepCode.IMPORT_B1_ENTRY],
    assignment: null,
    ...overrides,
  };
}

/**
 * Kho điều phối giả chỉ phục vụ test board — `findBoard` trả đúng danh sách được nạp sẵn.
 * Danh sách này **mô phỏng hợp đồng của repository thật sau khi vá lỗi nhân thẻ**: mỗi hồ sơ chỉ
 * xuất hiện **một dòng** dù có nhiều phương tiện (nhờ `LEFT JOIN LATERAL` chọn một biển số xác định
 * trong SQL). Bản thân phép chọn một-dòng-mỗi-hồ-sơ nằm ở SQL nên chỉ kiểm được trên DB thật
 * (`boot:check`); ở đây phủ tầng use-case — nơi KPI đếm số dòng và phân khung theo giai đoạn.
 */
class FakeBoardRepository implements DispatchAssignmentRepository {
  lastCriteria: DispatchBoardCriteria | undefined;

  constructor(private readonly boardRows: DispatchBoardRow[] = []) {}

  async findBoard(criteria: DispatchBoardCriteria): Promise<DispatchBoardRow[]> {
    this.lastCriteria = criteria;
    return this.boardRows;
  }

  async insert(assignment: DispatchAssignment): Promise<DispatchAssignment> {
    return assignment;
  }
  async update(assignment: DispatchAssignment): Promise<DispatchAssignment> {
    return assignment;
  }
  async findById(): Promise<DispatchAssignment | null> {
    return null;
  }
  async findActiveByDossier(): Promise<DispatchAssignment | null> {
    return null;
  }
  async findActiveBySlot(): Promise<DispatchAssignment | null> {
    return null;
  }
  async findActiveByYard(): Promise<DispatchAssignmentWithDossier[]> {
    return [];
  }
  async countOccupiedByYard(): Promise<Map<string, number>> {
    return new Map();
  }
  async countOverdueByYard(): Promise<Map<string, number>> {
    return new Map();
  }
}

function build(rows: DispatchBoardRow[]) {
  const repo = new FakeBoardRepository(rows);
  const scope = new DossierScopeService(new DataScopeService());
  return new GetDispatchBoardUseCase(repo, scope);
}

describe('Bảng điều phối 3 khung (CR41 · UI-08) — phân theo giai đoạn workflow', () => {
  it('phân đúng 3 khung theo giai đoạn hiện hành và KPI 3 số không trùng', async () => {
    const useCase = build([
      // Bước cổng vào (ENTRY_GATE) → Chờ điều phối, dù CHƯA gán ô đỗ.
      makeRow({ dossierId: 'd1', activeStepCodes: [WorkflowStepCode.IMPORT_B1_ENTRY], assignment: null }),
      // Cụm nghiệp vụ (INSPECTION) mở song song — bất kỳ bước nghiệp vụ nào mở → Đang kiểm tra.
      makeRow({
        dossierId: 'd2',
        activeStepCodes: [WorkflowStepCode.IMPORT_BORDER, WorkflowStepCode.IMPORT_CUSTOMS],
      }),
      // Bước thu phí (FEE) → Đã kiểm tra xong.
      makeRow({ dossierId: 'd3', activeStepCodes: [WorkflowStepCode.IMPORT_FEE] }),
      // Bước cổng ra (EXIT_GATE) → Đã kiểm tra xong.
      makeRow({ dossierId: 'd4', activeStepCodes: [WorkflowStepCode.IMPORT_B2_EXIT] }),
    ]);

    const view = await useCase.execute({ access: dispatcher, date: '2026-07-20' });

    expect(view.columns.map((column) => column.key)).toEqual(['WAITING', 'INSPECTING', 'INSPECTED']);
    expect(view.columns.map((column) => column.label)).toEqual([
      'Chờ điều phối',
      'Đang trong giai đoạn kiểm tra',
      'Đã kiểm tra xong',
    ]);
    expect(view.kpi).toEqual({ waiting: 1, inspecting: 1, inspected: 2 });

    const byKey = Object.fromEntries(view.columns.map((column) => [column.key, column.items.map((item) => item.dossierId)]));
    expect(byKey['WAITING']).toEqual(['d1']);
    expect(byKey['INSPECTING']).toEqual(['d2']);
    expect(byKey['INSPECTED']).toEqual(['d3', 'd4']);
  });

  it('khung theo giai đoạn — KHÔNG phụ thuộc việc đã gán ô đỗ hay chưa', async () => {
    const useCase = build([
      // Đã gán ô nhưng vẫn ở bước cổng vào → vẫn Chờ điều phối (trước đây rơi vào INSPECTING/INSPECTED).
      makeRow({ dossierId: 'in-slot-entry', activeStepCodes: [WorkflowStepCode.IMPORT_B1_ENTRY], assignment: inYardAssignment('in-slot-entry') }),
    ]);

    const view = await useCase.execute({ access: dispatcher, date: '2026-07-20' });

    expect(view.kpi).toEqual({ waiting: 1, inspecting: 0, inspected: 0 });
  });

  it('hồ sơ có trạng thái WAITING_CALL thì hiển thị ở thẻ Chờ điều phối dù bước nghiệp vụ đã mở', async () => {
    const useCase = build([
      makeRow({
        dossierId: 'd-waiting-call',
        dossierStatus: DeclarationStatus.WAITING_CALL,
        activeStepCodes: [WorkflowStepCode.IMPORT_BORDER, WorkflowStepCode.IMPORT_CUSTOMS],
      }),
      makeRow({
        dossierId: 'd-business-proc',
        dossierStatus: DeclarationStatus.BUSINESS_PROCESSING,
        activeStepCodes: [WorkflowStepCode.IMPORT_BORDER, WorkflowStepCode.IMPORT_CUSTOMS],
      }),
    ]);

    const view = await useCase.execute({ access: dispatcher, date: '2026-07-20' });

    expect(view.kpi).toEqual({ waiting: 1, inspecting: 1, inspected: 0 });
    const waitingCards = view.columns.find((c) => c.key === 'WAITING')?.items ?? [];
    const inspectingCards = view.columns.find((c) => c.key === 'INSPECTING')?.items ?? [];
    expect(waitingCards.map((c) => c.dossierId)).toEqual(['d-waiting-call']);
    expect(inspectingCards.map((c) => c.dossierId)).toEqual(['d-business-proc']);
  });

  it('nếu bất kỳ bước nghiệp vụ nào đang mở thì cả hồ sơ ở khung Đang kiểm tra', async () => {
    const useCase = build([
      makeRow({ dossierId: 'd-insp', activeStepCodes: [WorkflowStepCode.IMPORT_QUARANTINE] }),
    ]);

    const view = await useCase.execute({ access: dispatcher, date: '2026-07-20' });

    expect(view.kpi).toEqual({ waiting: 0, inspecting: 1, inspected: 0 });
  });

  it('hồ sơ không còn bước mở (phiên đã đóng / đã ra cửa khẩu) không lên bảng', async () => {
    const useCase = build([
      makeRow({ dossierId: 'd-done', activeStepCodes: [], currentStepCode: null }),
    ]);

    const view = await useCase.execute({ access: dispatcher, date: '2026-07-20' });

    expect(view.kpi).toEqual({ waiting: 0, inspecting: 0, inspected: 0 });
    expect(view.columns.every((column) => column.items.length === 0)).toBe(true);
  });

  it('hồ sơ nhiều phương tiện chỉ còn một thẻ với biển số xác định (không nhân dòng)', async () => {
    // Repository thật đã chọn một biển số xác định (nhỏ nhất, NULLS LAST) và gộp về một dòng;
    // hồ sơ hai xe "15C-777.88" + "29H-123.45" chỉ trả một dòng biển số "15C-777.88".
    const useCase = build([
      makeRow({ dossierId: 'ho-so-nhieu-xe', dossierCode: 'IMP-9', plateNumber: '15C-777.88' }),
    ]);

    const view = await useCase.execute({ access: dispatcher, date: '2026-07-20' });

    const cards = view.columns.flatMap((column) => column.items);
    expect(cards).toHaveLength(1);
    expect(cards[0].plateNumber).toBe('15C-777.88');
    expect(view.kpi.waiting).toBe(1);
  });

  it('chuyển nguyên khoảng ngày bắt đầu đã chuẩn hoá xuống repository (SG-144)', async () => {
    const repository = new FakeBoardRepository([makeRow()]);
    const useCase = new GetDispatchBoardUseCase(repository, new DossierScopeService(new DataScopeService()));
    const from = new Date('2026-08-01T00:00:00.000+07:00');
    const to = new Date('2026-08-19T23:59:59.999+07:00');

    await useCase.execute({ access: dispatcher, from, to });

    expect(repository.lastCriteria).toEqual(
      expect.objectContaining({
        from,
        to,
      }),
    );
  });

  it('chuyển từ khóa tìm kiếm (mã hồ sơ / biển số) xuống repository criteria', async () => {
    const repository = new FakeBoardRepository([makeRow()]);
    const useCase = new GetDispatchBoardUseCase(repository, new DossierScopeService(new DataScopeService()));

    await useCase.execute({ access: dispatcher, search: '26C-123' });

    expect(repository.lastCriteria).toEqual(
      expect.objectContaining({
        search: '26C-123',
      }),
    );
  });
});
