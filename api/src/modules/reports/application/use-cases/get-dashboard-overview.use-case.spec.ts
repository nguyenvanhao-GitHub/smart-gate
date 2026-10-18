import { UserAccessContext } from '../../../../common/auth/access-context';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { AssignmentType } from '../../../access-control/domain/assignment-type.enum';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { ListDeclarationsUseCase } from '../../../declarations/application/use-cases/list-declarations.use-case';
import {
  CheckpointCode,
  DeclarationStatus,
  DeclarationType,
  WorkflowStepCode,
  statusesForGroup,
} from '../../../declarations/domain/declaration.enums';
import { parseFilterEndDate, parseFilterStartDate } from '../../../../common/time/vietnam-date';
import { makeAccess, makeDeclaration } from '../../../declarations/testing/declaration.fixture';
import { FakeReportQueryRepository, FilteringDeclarationRepository } from '../../testing/report.fixture';
import { GetDashboardOverviewUseCase } from './get-dashboard-overview.use-case';

const ENTERPRISE_A = { taxCode: '5500111111', name: 'Doanh nghiệp A' };
const ENTERPRISE_B = { taxCode: '5500222222', name: 'Doanh nghiệp B' };

function dossier(
  id: string,
  status: DeclarationStatus,
  enterprise: { taxCode: string; name: string },
  overrides: { createdAt?: Date; checkpoint?: CheckpointCode; type?: DeclarationType } = {},
) {
  return makeDeclaration({
    id,
    code: `CK-${id}`,
    status,
    enterprise,
    createdById: enterprise === ENTERPRISE_A ? 'user-dn-a' : 'user-dn-b',
    createdAt: overrides.createdAt ?? new Date('2026-07-20T08:00:00.000Z'),
    checkpoint: overrides.checkpoint ?? CheckpointCode.B1,
    type: overrides.type ?? DeclarationType.IMPORT,
  });
}

/** 12 hồ sơ: 8 của doanh nghiệp A, 4 của doanh nghiệp B, rải đủ các trạng thái mà KPI đang đếm. */
const SEED = [
  dossier('01', DeclarationStatus.WAITING_GATE, ENTERPRISE_A),
  dossier('02', DeclarationStatus.WAITING_GATE, ENTERPRISE_A),
  dossier('03', DeclarationStatus.BUSINESS_PROCESSING, ENTERPRISE_A),
  dossier('04', DeclarationStatus.REVISION_REQUIRED, ENTERPRISE_A),
  dossier('05', DeclarationStatus.COMPLETED, ENTERPRISE_A),
  dossier('06', DeclarationStatus.COMPLETED, ENTERPRISE_A),
  dossier('07', DeclarationStatus.REJECTED, ENTERPRISE_A),
  dossier('08', DeclarationStatus.DRAFT, ENTERPRISE_A, { checkpoint: CheckpointCode.B2 }),
  dossier('09', DeclarationStatus.BUSINESS_PROCESSING, ENTERPRISE_B),
  dossier('10', DeclarationStatus.COMPLETED, ENTERPRISE_B),
  dossier('11', DeclarationStatus.REJECTED, ENTERPRISE_B, { createdAt: new Date('2026-07-10T08:00:00.000Z') }),
  dossier('12', DeclarationStatus.WAITING_GATE, ENTERPRISE_B, { type: DeclarationType.EXPORT }),
];

const ADMIN = makeAccess({
  userId: 'user-admin',
  roles: [{ code: 'MANAGEMENT', name: 'Lãnh đạo', dataScope: DataScopeLevel.ALL }],
  permissions: ['report.view'],
});

const ENTERPRISE_A_USER = makeAccess({
  userId: 'user-ke-toan-a',
  permissions: ['report.view'],
  assignments: [{ type: AssignmentType.TAX_CODE, value: ENTERPRISE_A.taxCode }],
});

/**
 * Trọng tâm của mốc M3: **con số trên dashboard phải mở ra đúng danh sách sinh ra nó**.
 *
 * Bài test không so KPI với một hằng số chép tay — nó gọi thẳng `ListDeclarationsUseCase` (chính
 * use-case mà màn hình danh sách hồ sơ dùng) với đúng `drilldown.queryParams` mà dashboard trả về,
 * và ánh xạ tham số y hệt `DeclarationsController.list`. Nếu một ngày ai đó sửa cách dashboard đếm
 * hoặc sửa cách danh sách lọc, bài test này đỏ ngay.
 */
describe('GetDashboardOverviewUseCase', () => {
  let declarations: FilteringDeclarationRepository;
  let reports: FakeReportQueryRepository;
  let useCase: GetDashboardOverviewUseCase;
  let listDeclarations: ListDeclarationsUseCase;

  const scopeService = new DossierScopeService(new DataScopeService());

  /** Bản sao đúng từng dòng của `DeclarationsController.list` — cầu nối giữa KPI và màn hình. */
  function openDossierList(queryParams: Record<string, string>, access: UserAccessContext) {
    return listDeclarations.execute({
      access,
      type: queryParams.type as DeclarationType | undefined,
      status: queryParams.status as DeclarationStatus | undefined,
      statuses: statusesForGroup(queryParams.statusGroup),
      checkpoint: queryParams.checkpoint as CheckpointCode | undefined,
      fromDate: parseFilterStartDate(queryParams.from),
      toDate: parseFilterEndDate(queryParams.to),
      pageSize: 100,
    });
  }

  beforeEach(() => {
    declarations = new FilteringDeclarationRepository(SEED);
    reports = new FakeReportQueryRepository();
    useCase = new GetDashboardOverviewUseCase(declarations, reports, scopeService);
    listDeclarations = new ListDeclarationsUseCase(declarations, scopeService);
  });

  describe('truy ngược về danh sách nguồn (DoD mốc M3)', () => {
    it('toàn bộ 6 KPI hồ sơ trỏ về danh sách hồ sơ', async () => {
      const overview = await useCase.execute({ access: ADMIN });

      expect(overview.kpis).toHaveLength(6);
      overview.kpis.forEach((kpi) => expect(kpi.drilldown.route).toBe('/declarations'));
    });

    it('giá trị mỗi KPI hồ sơ BẰNG ĐÚNG số dòng của danh sách mở theo drilldown', async () => {
      const overview = await useCase.execute({ access: ADMIN });

      for (const kpi of overview.kpis) {
        const list = await openDossierList(kpi.drilldown.queryParams, ADMIN);
        expect({ key: kpi.key, value: kpi.value }).toEqual({ key: kpi.key, value: list.total });
      }
    });

    it('vẫn khớp khi dashboard đang lọc theo kỳ và theo chốt', async () => {
      const overview = await useCase.execute({
        access: ADMIN,
        from: '2026-07-15T00:00:00.000Z',
        to: '2026-07-25T00:00:00.000Z',
        checkpoint: CheckpointCode.B1,
      });

      for (const kpi of overview.kpis) {
        expect(kpi.drilldown.queryParams.checkpoint).toBe(CheckpointCode.B1);
        const list = await openDossierList(kpi.drilldown.queryParams, ADMIN);
        expect({ key: kpi.key, value: kpi.value }).toEqual({ key: kpi.key, value: list.total });
      }
    });

    it('không phải khớp rỗng — số liệu thật sự khác nhau giữa các KPI', async () => {
      const overview = await useCase.execute({ access: ADMIN });
      const value = (key: string) => overview.kpis.find((kpi) => kpi.key === key)?.value;

      expect(value('total')).toBe(SEED.length);
      expect(value('waiting_gate')).toBe(3);
      expect(value('business_processing')).toBe(3);
      expect(value('rejected')).toBe(2);
      expect(value('needSupplement')).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // A) "Đang xử lý nghiệp vụ" đếm theo NHÓM trạng thái vòng đời.
  // ---------------------------------------------------------------------------
  describe('"Đang xử lý nghiệp vụ" đếm theo nhóm trạng thái vòng đời', () => {
    // 4 hồ sơ trong nhóm BUSINESS_PROCESS (WAITING_CALL, BUSINESS_PROCESSING, WAITING_FOR_FEE, READY_FOR_EXIT) + 2 hồ sơ ngoài nhóm.
    const IN_PROGRESS_SEED = [
      dossier('p1', DeclarationStatus.BUSINESS_PROCESSING, ENTERPRISE_A),
      dossier('p2', DeclarationStatus.WAITING_CALL, ENTERPRISE_A),
      dossier('p3', DeclarationStatus.WAITING_FOR_FEE, ENTERPRISE_A),
      dossier('p4', DeclarationStatus.READY_FOR_EXIT, ENTERPRISE_A),
      dossier('p5', DeclarationStatus.WAITING_GATE, ENTERPRISE_A),
      dossier('p6', DeclarationStatus.COMPLETED, ENTERPRISE_A),
    ];

    it('drilldown mang statusGroup=BUSINESS_PROCESS và đếm WAITING_CALL + BUSINESS_PROCESSING + WAITING_FOR_FEE + READY_FOR_EXIT', async () => {
      const repo = new FilteringDeclarationRepository(IN_PROGRESS_SEED);
      const scoped = new GetDashboardOverviewUseCase(repo, reports, scopeService);
      const listUseCase = new ListDeclarationsUseCase(repo, scopeService);

      const overview = await scoped.execute({ access: ADMIN });
      const processing = overview.kpis.find((kpi) => kpi.key === 'business_processing');

      expect(processing?.value).toBe(4);
      expect(processing?.drilldown.queryParams).toEqual({ statusGroup: 'BUSINESS_PROCESS' });

      // Mở đúng danh sách theo drilldown thì số dòng KHỚP con số trên thẻ.
      const list = await listUseCase.execute({
        access: ADMIN,
        statuses: statusesForGroup(processing?.drilldown.queryParams.statusGroup),
        pageSize: 100,
      });
      expect(list.total).toBe(4);
    });
  });

  describe('phạm vi dữ liệu', () => {
    it('tài khoản OWN chỉ đếm hồ sơ của doanh nghiệp mình', async () => {
      const overview = await useCase.execute({ access: ENTERPRISE_A_USER });
      const total = overview.kpis.find((kpi) => kpi.key === 'total')?.value;

      expect(total).toBe(8);
      expect(total).toBeLessThan(SEED.length);
    });

    it('KPI của tài khoản OWN vẫn khớp danh sách mà chính tài khoản đó mở ra', async () => {
      const overview = await useCase.execute({ access: ENTERPRISE_A_USER });

      for (const kpi of overview.kpis) {
        const list = await openDossierList(kpi.drilldown.queryParams, ENTERPRISE_A_USER);
        expect({ key: kpi.key, value: kpi.value }).toEqual({ key: kpi.key, value: list.total });
      }
    });

    it('mọi truy vấn tổng hợp đều nhận phạm vi đã siết, không có câu nào bỏ sót', async () => {
      await useCase.execute({ access: ENTERPRISE_A_USER });

      expect(reports.seenScopes.length).toBeGreaterThan(0);
      reports.seenScopes.forEach((call) => {
        expect(call.scope).toEqual({
          unrestricted: false,
          ownerUserId: 'user-ke-toan-a',
          taxCodes: [ENTERPRISE_A.taxCode],
        });
      });
    });

    it('không hỏi sức chứa bãi khi người dùng không có phạm vi toàn hệ thống', async () => {
      const withFullYard = new FakeReportQueryRepository({
        yardCapacity: [{ yardCode: 'A', yardName: 'Khu A', capacity: 16, slots: 16, occupied: 16 }],
      });
      const scoped = new GetDashboardOverviewUseCase(declarations, withFullYard, scopeService);

      const overview = await scoped.execute({ access: ENTERPRISE_A_USER });

      expect(withFullYard.seenScopes.some((call) => call.method === 'findYardCapacity')).toBe(false);
      expect(overview.alerts.some((alert) => alert.message.includes('kín chỗ'))).toBe(false);
    });
  });

  describe('cảnh báo — chỉ dựng từ dữ liệu thật', () => {
    it('nêu đích danh hồ sơ bị từ chối kèm mã hồ sơ để mở chi tiết', async () => {
      const withAlerts = new FakeReportQueryRepository({
        rejections: [{ dossierId: '07', dossierCode: 'CK-07', reasonNote: 'Sai số khung' }],
        gateDenials: 2,
      });
      const useCaseWithAlerts = new GetDashboardOverviewUseCase(declarations, withAlerts, scopeService);

      const overview = await useCaseWithAlerts.execute({ access: ADMIN });

      expect(overview.alerts).toContainEqual({
        level: 'DANGER',
        message: 'Hồ sơ CK-07 bị từ chối: Sai số khung',
        dossierId: '07',
        dossierCode: 'CK-07',
      });
      expect(overview.alerts).toContainEqual({
        level: 'WARN',
        message: '2 lượt xe bị từ chối qua cổng trong kỳ.',
      });
    });

    it('không sinh cảnh báo quá hạn/SLA — dự án đã chốt bỏ ngưỡng SLA (điểm D5)', async () => {
      const overview = await useCase.execute({ access: ADMIN });

      overview.alerts.forEach((alert) => {
        expect(alert.message).not.toMatch(/quá hạn|SLA|trễ hạn/i);
      });
    });
  });

  describe('biểu đồ và bảng theo lực lượng', () => {
    it('trả đủ 24 khung giờ để biểu đồ không nhảy cột', async () => {
      const overview = await useCase.execute({ access: ADMIN });

      expect(overview.hourly).toHaveLength(24);
      expect(overview.hourly[7]).toEqual({ hour: '07:00', submitted: 0, passed: 0 });
    });

    it('gộp bước theo lực lượng chủ trì', async () => {
      const withSteps = new FakeReportQueryRepository({
        stepStates: [
          { stepCode: 'IMPORT_CUSTOMS', status: 'IN_PROGRESS', count: 3 },
          { stepCode: 'IMPORT_CUSTOMS', status: 'COMPLETED', count: 5 },
          { stepCode: 'EXPORT_CUSTOMS', status: 'PENDING', count: 2 },
        ],
      });
      const useCaseWithSteps = new GetDashboardOverviewUseCase(declarations, withSteps, scopeService);

      const overview = await useCaseWithSteps.execute({ access: ADMIN });
      const customs = overview.byForce.find((row) => row.agencyCode === 'CUSTOMS');

      expect(customs).toEqual({
        agencyCode: 'CUSTOMS',
        agencyName: 'Hải quan',
        waiting: 2,
        processing: 3,
        completed: 5,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Sơ đồ TRẠNG THÁI "Tình hình cửa khẩu" (gateYard) — chức năng mới Đợt 2.
  // ---------------------------------------------------------------------------
  describe('sơ đồ tình hình cửa khẩu (gateYard)', () => {
    it('gộp đủ luồng cổng hôm nay, số đang chờ hàng đợi và tồn bãi theo khu', async () => {
      const withFlow = new FakeReportQueryRepository({
        gateFlowToday: { passed: 37, denied: 4 },
        queueWaiting: 9,
        yardCapacity: [{ yardCode: 'A', yardName: 'Khu A', capacity: 20, slots: 20, occupied: 12 }],
      });
      const useCaseWithFlow = new GetDashboardOverviewUseCase(declarations, withFlow, scopeService);

      const overview = await useCaseWithFlow.execute({ access: ADMIN });

      expect(overview.gateYard).toEqual({
        yards: [{ yardName: 'Khu A', occupied: 12, slots: 20 }],
        gatePassedToday: 37,
        gateDeniedToday: 4,
        queueWaiting: 9,
      });
    });

    it('CHỈ có `yards` khi phạm vi ALL — không rò hạ tầng cho tài khoản hạn chế (bất biến findYardCapacity)', async () => {
      const withFlow = new FakeReportQueryRepository({
        gateFlowToday: { passed: 5, denied: 1 },
        queueWaiting: 2,
        yardCapacity: [{ yardCode: 'A', yardName: 'Khu A', capacity: 20, slots: 20, occupied: 12 }],
      });
      const scoped = new GetDashboardOverviewUseCase(declarations, withFlow, scopeService);

      const overview = await scoped.execute({ access: ENTERPRISE_A_USER });

      // Khu bãi là số liệu hạ tầng chung — tài khoản doanh nghiệp không được thấy.
      expect(overview.gateYard.yards).toEqual([]);
      expect(withFlow.seenScopes.some((call) => call.method === 'findYardCapacity')).toBe(false);
      // Nhưng luồng cổng và hàng đợi của chính họ vẫn có, và vẫn siết đúng phạm vi.
      expect(overview.gateYard.gatePassedToday).toBe(5);
      expect(overview.gateYard.gateDeniedToday).toBe(1);
      expect(overview.gateYard.queueWaiting).toBe(2);
      const gateCall = withFlow.seenScopes.find((call) => call.method === 'getGateFlowToday');
      const queueCall = withFlow.seenScopes.find((call) => call.method === 'countWaitingQueue');
      const expectedScope = { unrestricted: false, ownerUserId: 'user-ke-toan-a', taxCodes: [ENTERPRISE_A.taxCode] };
      expect(gateCall?.scope).toEqual(expectedScope);
      expect(queueCall?.scope).toEqual(expectedScope);
    });

    it('không có số liệu cổng thì trả 0, không vỡ', async () => {
      const overview = await useCase.execute({ access: ADMIN });

      expect(overview.gateYard).toEqual({ yards: [], gatePassedToday: 0, gateDeniedToday: 0, queueWaiting: 0 });
    });
  });

  // ---------------------------------------------------------------------------
  // Panel "Cần xử lý sớm" (attention) — chức năng mới Đợt 2.
  // ---------------------------------------------------------------------------
  describe('panel "Cần xử lý sớm" (attention)', () => {
    it('ánh xạ đúng dossierId/dossierCode/stepLabel/waitingSince và GIỮ thứ tự chờ lâu nhất lên đầu', async () => {
      const withAttention = new FakeReportQueryRepository({
        attention: [
          {
            dossierId: '20',
            dossierCode: 'CK-20',
            enterpriseName: 'Doanh nghiệp A',
            type: DeclarationType.IMPORT,
            stepCode: WorkflowStepCode.IMPORT_CUSTOMS,
            enteredAt: new Date('2026-07-20T01:00:00.000Z'),
          },
          {
            dossierId: '21',
            dossierCode: 'CK-21',
            enterpriseName: null,
            type: DeclarationType.EXPORT,
            stepCode: WorkflowStepCode.EXPORT_QUARANTINE,
            enteredAt: new Date('2026-07-20T05:00:00.000Z'),
          },
        ],
      });
      const useCaseWithAttention = new GetDashboardOverviewUseCase(declarations, withAttention, scopeService);

      const overview = await useCaseWithAttention.execute({ access: ADMIN });

      // Thứ tự do repository quyết (chờ lâu nhất trước) — use-case không đảo lại. Hồ sơ không có tên
      // doanh nghiệp (dữ liệu cũ) rơi về chuỗi rỗng, không ném lỗi.
      expect(overview.attention).toEqual([
        {
          dossierId: '20',
          dossierCode: 'CK-20',
          enterpriseName: 'Doanh nghiệp A',
          type: DeclarationType.IMPORT,
          stepLabel: 'Hải quan kiểm tra nghiệp vụ theo chuyên ngành',
          waitingSince: '2026-07-20T01:00:00.000Z',
        },
        {
          dossierId: '21',
          dossierCode: 'CK-21',
          enterpriseName: '',
          type: DeclarationType.EXPORT,
          stepLabel: 'Kiểm dịch kiểm tra nghiệp vụ theo chuyên ngành',
          waitingSince: '2026-07-20T05:00:00.000Z',
        },
      ]);
    });

    it('mã bước lạ (dữ liệu rác) giữ nguyên mã, không rơi nhãn mặc định', async () => {
      const withAttention = new FakeReportQueryRepository({
        attention: [
          {
            dossierId: '99',
            dossierCode: 'CK-99',
            enterpriseName: 'Doanh nghiệp A',
            type: DeclarationType.IMPORT,
            stepCode: 'BUOC_KHONG_TON_TAI',
            enteredAt: new Date('2026-07-20T01:00:00.000Z'),
          },
        ],
      });
      const useCaseWithAttention = new GetDashboardOverviewUseCase(declarations, withAttention, scopeService);

      const overview = await useCaseWithAttention.execute({ access: ADMIN });

      expect(overview.attention[0].stepLabel).toBe('BUOC_KHONG_TON_TAI');
    });

    it('tôn trọng giới hạn số dòng hồ sơ chờ (ATTENTION_LIMIT = 6)', async () => {
      const rows = Array.from({ length: 10 }, (_, index) => ({
        dossierId: `d${index}`,
        dossierCode: `CK-${index}`,
        enterpriseName: `Doanh nghiệp ${index}`,
        type: DeclarationType.IMPORT,
        stepCode: WorkflowStepCode.IMPORT_CUSTOMS,
        enteredAt: new Date('2026-07-20T01:00:00.000Z'),
      }));
      const withAttention = new FakeReportQueryRepository({ attention: rows });
      const useCaseWithAttention = new GetDashboardOverviewUseCase(declarations, withAttention, scopeService);

      const overview = await useCaseWithAttention.execute({ access: ADMIN });

      expect(overview.attention).toHaveLength(6);
      overview.attention.forEach((item) => expect(item).not.toHaveProperty('overdue'));
    });

    it('SG-251: hồ sơ có nhiều bước mở song song thì ghép tên các đơn vị đang chờ', async () => {
      const withAttention = new FakeReportQueryRepository({
        attention: [
          {
            dossierId: '50',
            dossierCode: 'CK-50',
            enterpriseName: 'Doanh nghiệp A',
            type: DeclarationType.EXPORT,
            stepCode: `${WorkflowStepCode.EXPORT_BORDER},${WorkflowStepCode.EXPORT_CUSTOMS},${WorkflowStepCode.EXPORT_QUARANTINE}`,
            enteredAt: new Date('2026-07-20T01:00:00.000Z'),
          },
        ],
      });
      const useCaseWithAttention = new GetDashboardOverviewUseCase(declarations, withAttention, scopeService);

      const overview = await useCaseWithAttention.execute({ access: ADMIN });

      expect(overview.attention[0].stepLabel).toBe('Biên phòng, Hải quan, Kiểm dịch: Kiểm tra nghiệp vụ theo chuyên ngành');
    });
  });

  // ---------------------------------------------------------------------------
  // Hai chiều phân tích SRS đòi: theo luồng (byType) và theo ngày (daily) — BUG-030.
  // ---------------------------------------------------------------------------
  describe('cơ cấu theo luồng và lưu lượng theo ngày (BUG-030)', () => {
    it('cơ cấu theo luồng ánh xạ đúng mã loại và số hồ sơ, giữ thứ tự repository trả', async () => {
      const withType = new FakeReportQueryRepository({
        byType: [
          { type: DeclarationType.IMPORT, count: 8 },
          { type: DeclarationType.EXPORT, count: 3 },
          { type: DeclarationType.TRANSSHIPMENT_EXPORT, count: 1 },
        ],
      });
      const scoped = new GetDashboardOverviewUseCase(declarations, withType, scopeService);

      const overview = await scoped.execute({ access: ADMIN });

      expect(overview.byType).toEqual([
        { type: DeclarationType.IMPORT, count: 8 },
        { type: DeclarationType.EXPORT, count: 3 },
        { type: DeclarationType.TRANSSHIPMENT_EXPORT, count: 1 },
      ]);
    });

    it('lưu lượng theo ngày chỉ giữ số gửi/hoàn tất, cắt còn N ngày gần nhất', async () => {
      // 16 ngày liên tiếp; chỉ 14 ngày gần nhất được giữ, ngày cũ nhất bị cắt.
      const throughput = Array.from({ length: 16 }, (_, index) => ({
        date: `2026-07-${String(index + 1).padStart(2, '0')}`,
        total: index + 5,
        submitted: index + 2,
        completed: index,
        rejected: 0,
      }));
      const withDaily = new FakeReportQueryRepository({ throughput });
      const scoped = new GetDashboardOverviewUseCase(declarations, withDaily, scopeService);

      const overview = await scoped.execute({ access: ADMIN });

      expect(overview.daily).toHaveLength(14);
      // Cắt lấy đuôi: ngày đầu tiên còn lại là ngày thứ 3 (bỏ 2 ngày cũ nhất).
      expect(overview.daily[0]).toEqual({ date: '2026-07-03', submitted: 4, completed: 2 });
      expect(overview.daily[13]).toEqual({ date: '2026-07-16', submitted: 17, completed: 15 });
      // Chỉ trình bày số gửi/hoàn tất — không mang theo total/rejected.
      const keys = overview.daily.map((point) => Object.keys(point).join(','));
      expect(new Set(keys)).toEqual(new Set(['date,submitted,completed']));
    });

    it('cả hai chiều đều siết theo phạm vi dữ liệu của người dùng', async () => {
      await useCase.execute({ access: ENTERPRISE_A_USER });

      const expectedScope = { unrestricted: false, ownerUserId: 'user-ke-toan-a', taxCodes: [ENTERPRISE_A.taxCode] };
      expect(reports.seenScopes.find((call) => call.method === 'countDossiersByType')?.scope).toEqual(expectedScope);
      expect(reports.seenScopes.find((call) => call.method === 'findDossierThroughput')?.scope).toEqual(expectedScope);
    });
  });

  // ---------------------------------------------------------------------------
  // Xu hướng "hôm nay so với hôm qua" (trend) — Lô 5.
  // ---------------------------------------------------------------------------
  describe('xu hướng "so với hôm qua" (trend)', () => {
    function withCreatedAt(id: string, at: Date) {
      return dossier(id, DeclarationStatus.SUBMITTED, ENTERPRISE_A, { createdAt: at });
    }

    it('CHỈ KPI tổng gắn trend; KPI theo trạng thái thì không (không bịa xu hướng cho số tồn kho)', async () => {
      const overview = await useCase.execute({ access: ADMIN });

      expect(overview.kpis.find((kpi) => kpi.key === 'total')?.trend).toBeDefined();
      overview.kpis
        .filter((kpi) => kpi.key !== 'total')
        .forEach((kpi) => expect(kpi.trend).toBeUndefined());
    });

    it('đếm hồ sơ tạo hôm nay so với hôm qua rồi tính delta %', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const repo = new FilteringDeclarationRepository([
        withCreatedAt('t1', now),
        withCreatedAt('t2', now),
        withCreatedAt('t3', now),
        withCreatedAt('y1', yesterday),
        withCreatedAt('y2', yesterday),
      ]);
      const scoped = new GetDashboardOverviewUseCase(repo, reports, scopeService);

      const overview = await scoped.execute({ access: ADMIN });

      expect(overview.kpis.find((kpi) => kpi.key === 'total')?.trend).toEqual({
        today: 3,
        yesterday: 2,
        deltaPercent: 50,
        direction: 'up',
      });
    });

    it('hôm qua bằng 0 thì deltaPercent = null (không chia được), không bịa số', async () => {
      const repo = new FilteringDeclarationRepository([withCreatedAt('t1', new Date())]);
      const scoped = new GetDashboardOverviewUseCase(repo, reports, scopeService);

      const overview = await scoped.execute({ access: ADMIN });

      expect(overview.kpis.find((kpi) => kpi.key === 'total')?.trend).toEqual({
        today: 1,
        yesterday: 0,
        deltaPercent: null,
        direction: 'up',
      });
    });

    it('không gắn trend khi dashboard đang lọc theo khoảng ngày (kỳ lịch sử, "hôm qua" vô nghĩa)', async () => {
      const overview = await useCase.execute({ access: ADMIN, from: '2026-07-01', to: '2026-07-31' });

      overview.kpis.forEach((kpi) => expect(kpi.trend).toBeUndefined());
    });
  });
});
