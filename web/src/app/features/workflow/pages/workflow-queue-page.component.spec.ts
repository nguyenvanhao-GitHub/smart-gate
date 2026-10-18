import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { AccessProfile } from '../../../core/auth/access-control.model';
import { SESSION_STORAGE_KEY } from '../../../core/auth/session.storage';
import { QueueItem } from '../../../core/models/workflow.model';
import { ApiService, Paged } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { WorkflowQueuePageComponent } from './workflow-queue-page.component';

/**
 * UI-06 Hàng đợi xử lý liên ngành (CR23–CR27).
 *
 * Bộ test khóa các thay đổi Batch C: **không** còn cột ưu tiên / vào bước / đã trôi qua (CR23),
 * **không** còn nút đánh dấu ưu tiên (CR24), **không** còn khối "Đã xử lý gần đây" (CR25); cột
 * "Trạng thái" của tab cần xử lý luôn là "Đang xử lý nghiệp vụ"; nút View mở
 * `/workflow/dossiers/:id` (CR27).
 */

function hoSoTruyCap(permissions: string[] = ['workflow.view', 'workflow.update', 'workflow.approve']): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'haiquan',
      displayName: 'Lê Văn Nam',
      title: 'Cán bộ Hải quan',
      email: 'nam@chc.gov.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: null,
    },
    roles: [{ code: 'HAI_QUAN', name: 'Hải quan', dataScope: 'ASSIGNMENT' }],
    permissions,
    assignments: [],
    menu: [],
  };
}

function dong(mau: Partial<QueueItem> = {}): QueueItem {
  return {
    dossierId: 'hs-1',
    code: 'HS-250519-0015',
    type: 'IMPORT',
    status: 'PROCESSING',
    enterprise: { taxCode: '5501234567', name: 'Cty CP Nông sản Tây Bắc' },
    vehicle: { plateNumber: '26C-123.45' },
    currentStep: { code: 'HQ_TIEP_NHAN', name: 'Tiếp nhận hồ sơ', agencyCode: 'HQ', agencyName: 'Hải quan', gate: null },
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T01:00:00.000Z',
    ...mau,
  };
}

function trang(items: QueueItem[], total = items.length, page = 1, pageSize = 10): Paged<QueueItem> {
  return { items, total, page, pageSize };
}

describe('WorkflowQueuePageComponent — hàng đợi liên ngành', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<WorkflowQueuePageComponent>;
  let component: WorkflowQueuePageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function taoTrang(queryParams: Record<string, string> = {}): void {
    TestBed.configureTestingModule({
      imports: [WorkflowQueuePageComponent],
      providers: [
        provideRouter([
          { path: 'workflow/queue', children: [] },
          { path: 'workflow/dossiers/:id', children: [] },
        ]),
        { provide: ApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(queryParams)) } },
      ],
    });

    fixture = TestBed.createComponent(WorkflowQueuePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function noiDungBang(): string {
    return (fixture.nativeElement.querySelector('table.grid tbody') as HTMLElement).textContent || '';
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap() }));

    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getWorkflowQueue',
      'getAccessProfile',
      'getDossierTypes',
      'getCheckpoints',
    ]);
    api.getWorkflowQueue.and.returnValue(of(trang([dong()])));
    api.getAccessProfile.and.returnValue(of(hoSoTruyCap()));
    api.getDossierTypes.and.returnValue(of([]));
    api.getCheckpoints.and.returnValue(of([]));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    sessionStorage.clear();
  });

  // ---------------------------------------------------------------------------
  describe('Trạng thái tải, rỗng và lỗi (SRS 8.1)', () => {
    it('đang tải thì hiện dòng "Đang tải hàng đợi..."', () => {
      api.getWorkflowQueue.and.returnValue(NEVER);
      taoTrang();

      expect(noiBo()['loading']()).toBe(true);
      expect(noiDungBang()).toContain('Đang tải hàng đợi');
    });

    it('hàng đợi trống thì báo không có hồ sơ đến lượt đơn vị', () => {
      api.getWorkflowQueue.and.returnValue(of(trang([])));
      taoTrang();

      expect(noiDungBang()).toContain('Hàng đợi trống');
    });

    it('mỗi tab có thông báo rỗng riêng', () => {
      api.getWorkflowQueue.and.returnValue(of(trang([])));
      taoTrang({ tab: 'waiting' });

      expect(noiDungBang()).toContain('Không có hồ sơ nào đang chờ doanh nghiệp bổ sung');
    });

    it('đang lọc mà không có kết quả thì gợi ý đặt lại bộ lọc', () => {
      api.getWorkflowQueue.and.returnValue(of(trang([])));
      taoTrang({ status: 'REJECTED' });

      expect(noiBo()['hasActiveFilters']()).toBe(true);
      expect(noiDungBang()).toContain('Không có hồ sơ nào khớp điều kiện lọc');
    });

    it('API lỗi thì hiện thông báo lỗi và bảng rỗng', () => {
      api.getWorkflowQueue.and.returnValue(throwError(() => new Error('mat ket noi')));
      taoTrang();

      expect(noiBo()['error']()).toBe('Không tải được hàng đợi liên ngành. Vui lòng kiểm tra kết nối và thử lại.');
      expect(noiBo()['items']().length).toBe(0);
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.text.includes('Không tải được hàng đợi liên ngành'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Tab cần xử lý / đã xử lý / chờ bổ sung', () => {
    it('mặc định mở tab "Cần xử lý" và gửi tab=todo lên API', () => {
      taoTrang();

      expect(noiBo()['activeTab']()).toBe('todo');
      expect(api.getWorkflowQueue.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ tab: 'todo' }));
    });

    it('đổi tab thì tải lại từ trang 1 với tab mới', () => {
      taoTrang();
      noiBo()['goToPage'](2);

      noiBo()['changeTab']('done');

      expect(noiBo()['activeTab']()).toBe('done');
      expect(noiBo()['page']()).toBe(1);
      expect(api.getWorkflowQueue.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ tab: 'done', page: 1 }));
    });

    it('nhận tab từ query param, tab lạ thì quay về "todo"', () => {
      taoTrang({ tab: 'waiting' });
      expect(noiBo()['activeTab']()).toBe('waiting');

      TestBed.resetTestingModule();
      taoTrang({ tab: 'sla' });
      expect(noiBo()['activeTab']()).toBe('todo');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Bộ lọc và phân trang', () => {
    it('SG-212 — statusOptions chỉ chứa các trạng thái hợp lệ (loại bỏ DRAFT, WAITING_GATE, WAITING_CALL, REJECTED, CANCELLED)', () => {
      taoTrang();
      const statuses = noiBo()['statusOptions']().map((opt: { value: string }) => opt.value);
      expect(statuses).toEqual([
        'BUSINESS_PROCESSING',
        'REVISION_REQUIRED',
        'WAITING_FOR_FEE',
        'READY_FOR_EXIT',
        'COMPLETED',
      ]);
    });

    it('gửi đúng tham số lọc lên API (KHÔNG còn tham số priority hay checkpoint — SG-143)', () => {
      taoTrang();
      noiBo()['filters'].keyword = '  26C-123.45  ';
      noiBo()['filters'].type = 'IMPORT';
      noiBo()['filters'].status = 'PROCESSING';

      noiBo()['applyFilters']();

      expect(api.getWorkflowQueue.calls.mostRecent().args[0]).toEqual({
        tab: 'todo',
        keyword: '26C-123.45',
        type: 'IMPORT',
        status: 'PROCESSING',
        from: '',
        to: '',
        page: 1,
        pageSize: 10,
      });
    });

    it('SG-118 — tự động áp dụng bộ lọc ngay sau khi chọn ngày bắt đầu hoặc ngày kết thúc', () => {
      taoTrang();
      const datePickers = fixture.nativeElement.querySelectorAll('sg-date-picker');
      expect(datePickers.length).toBe(2);

      // Thay đổi ngày bắt đầu
      component['filters'].from = '2026-08-01';
      component['applyFilters']();

      expect(api.getWorkflowQueue.calls.mostRecent().args[0]).toEqual(
        jasmine.objectContaining({ from: '2026-08-01', page: 1 }),
      );

      // Thay đổi ngày kết thúc
      component['filters'].to = '2026-08-19';
      component['applyFilters']();

      expect(api.getWorkflowQueue.calls.mostRecent().args[0]).toEqual(
        jasmine.objectContaining({ from: '2026-08-01', to: '2026-08-19', page: 1 }),
      );
    });

    it('BUG-042 — gửi khoảng ngày (from/to) lên API', () => {
      taoTrang();
      noiBo()['filters'].from = '2026-07-01';
      noiBo()['filters'].to = '2026-07-31';

      noiBo()['applyFilters']();

      expect(api.getWorkflowQueue.calls.mostRecent().args[0]).toEqual(
        jasmine.objectContaining({ from: '2026-07-01', to: '2026-07-31' }),
      );
    });

    it('BUG-042 — Từ ngày muộn hơn Đến ngày thì chặn ở web, không gọi API và báo lỗi', () => {
      taoTrang();
      const soLan = api.getWorkflowQueue.calls.count();
      noiBo()['filters'].from = '2026-07-31';
      noiBo()['filters'].to = '2026-07-01';

      noiBo()['applyFilters']();

      expect(api.getWorkflowQueue.calls.count()).toBe(soLan);
      expect(noiBo()['error']()).toBe('Từ ngày phải trước hoặc bằng Đến ngày.');
      expect(noiBo()['items']().length).toBe(0);
    });

    it('tính số trang theo tổng bản ghi và chuyển trang được', () => {
      api.getWorkflowQueue.and.returnValue(of(trang([dong()], 45)));
      taoTrang();

      expect(noiBo()['totalPages']()).toBe(5);
      expect(noiBo()['summary']()).toBe('Hiển thị 1 đến 10 trong tổng số 45 hồ sơ');

      noiBo()['goToPage'](3);
      expect(api.getWorkflowQueue.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ page: 3 }));
    });
  });

  // ---------------------------------------------------------------------------
  describe('Bảng hồ sơ (CR23/CR26/CR27)', () => {
    it('hiện đủ mã hồ sơ, phương tiện, doanh nghiệp và đơn vị đang chờ', () => {
      taoTrang();
      const noiDung = noiDungBang();

      expect(noiDung).toContain('HS-250519-0015');
      expect(noiDung).toContain('26C-123.45');
      expect(noiDung).toContain('Cty CP Nông sản Tây Bắc');
      expect(noiDung).toContain('Hải quan');
      expect(noiDung).toContain('Tiếp nhận hồ sơ');
    });

    it('CR23 — KHÔNG còn cột "Đã trôi qua ở bước hiện tại" hay mức ưu tiên', () => {
      taoTrang();
      const head = (fixture.nativeElement.querySelector('table.grid thead') as HTMLElement).textContent || '';

      expect(head).not.toContain('Đã trôi qua ở bước hiện tại');
      expect(head).not.toContain('Mức ưu tiên');
      expect(head).not.toContain('Vào bước lúc');
    });

    it('tab "Cần xử lý" chỉ hiển thị "Đang xử lý nghiệp vụ"', () => {
      taoTrang();
      expect(noiBo()['statusCell'](dong({ status: 'BUSINESS_PROCESSING' }))).toBe('Đang xử lý nghiệp vụ');
      expect(noiBo()['statusCell'](dong({ status: 'PROCESSING' }))).toBe('Đang xử lý nghiệp vụ');
      expect(noiDungBang()).toContain('Đang xử lý nghiệp vụ');
    });

    it('tab "Cần xử lý" không để bước cổng ghi đè trạng thái BUSINESS_PROCESSING', () => {
      const buocCong = dong({
        status: 'BUSINESS_PROCESSING',
        currentStep: { code: 'IMPORT_B1_ENTRY', name: 'Xác nhận xe vào', agencyCode: 'BORDER_GUARD', agencyName: 'Biên phòng', gate: 'ENTRY' },
      });
      api.getWorkflowQueue.and.returnValue(of(trang([buocCong])));
      taoTrang();

      expect(noiBo()['statusCell'](buocCong)).toBe('Đang xử lý nghiệp vụ');
      expect(noiDungBang()).toContain('Đang xử lý nghiệp vụ');
      expect(noiDungBang()).not.toContain('Chờ vào cổng');
    });

    it('không vỡ khi hồ sơ đã đi hết quy trình nên không còn bước hiện tại', () => {
      api.getWorkflowQueue.and.returnValue(of(trang([dong({ currentStep: null, status: 'WORKFLOW_DONE' })])));
      taoTrang({ tab: 'done' });

      const noiDung = noiDungBang();
      expect(noiDung).toContain('HS-250519-0015');
      expect(noiDung).toContain('Đã xong');
      expect(noiBo()['statusCell'](dong({ currentStep: null, status: 'WORKFLOW_DONE' }))).toBe('Xong liên ngành');
    });

    it('SG-253 — hàng KPI hiển thị đúng số liệu các thẻ (Cần xử lý / Đã xử lý / Chờ bổ sung)', () => {
      const res: Paged<QueueItem> = trang(
        [
          dong({ dossierId: 'a', status: 'BUSINESS_PROCESSING' }),
          dong({ dossierId: 'b', status: 'BUSINESS_PROCESSING' }),
        ],
        42,
      );
      res.stats = { todo: 42, done: 15, waiting: 3 };
      api.getWorkflowQueue.and.returnValue(of(res));
      taoTrang();

      expect(noiBo()['total']()).toBe(42);
      expect(noiBo()['kpiTodo']()).toBe(42);
      expect(noiBo()['kpiDone']()).toBe(15);
      expect(noiBo()['kpiWaiting']()).toBe(3);
    });

    it('CR27 — mỗi dòng có nút View mở màn xử lý liên ngành của đúng hồ sơ', () => {
      taoTrang();
      const links = Array.from(fixture.nativeElement.querySelectorAll('table.grid tbody a')) as HTMLAnchorElement[];

      expect(links.some((link) => link.getAttribute('href') === '/workflow/dossiers/hs-1')).toBe(true);
    });

    it('CR24 — KHÔNG còn nút "Đánh dấu ưu tiên"', () => {
      taoTrang();
      const nut = Array.from(fixture.nativeElement.querySelectorAll('table.grid tbody button')) as HTMLButtonElement[];

      expect(nut.some((item) => (item.getAttribute('aria-label') || '').includes('ưu tiên'))).toBe(false);
    });

    it('CR25 — KHÔNG còn khối "Đã xử lý gần đây"', () => {
      taoTrang();
      expect(fixture.nativeElement.querySelector('.recent')).toBeNull();
      expect(fixture.nativeElement.textContent as string).not.toContain('Đã xử lý gần đây');
    });

    it('hiển thị nhãn/cờ Dịch tễ khi dossier có epidemicFlag = true', () => {
      api.getWorkflowQueue.and.returnValue(of(trang([dong({ epidemicFlag: true })])));
      taoTrang();

      expect(noiDungBang()).toContain('Dịch tễ');
      expect(fixture.nativeElement.querySelector('.epidemic')).not.toBeNull();
    });

    it('hiển thị Đơn vị đang chờ đúng luồng xử lý: hồ sơ bình thường vs hồ sơ dịch tễ', () => {
      const normalItem = dong({
        epidemicFlag: false,
        activeSteps: [
          { code: 'IMPORT_BORDER', name: 'Biên phòng kiểm tra nghiệp vụ', agencyCode: 'BORDER_GUARD', agencyName: 'Biên phòng', gate: null },
          { code: 'IMPORT_CUSTOMS', name: 'Hải quan kiểm tra nghiệp vụ', agencyCode: 'CUSTOMS', agencyName: 'Hải quan', gate: null },
          { code: 'IMPORT_QUARANTINE', name: 'Kiểm dịch kiểm tra nghiệp vụ', agencyCode: 'QUARANTINE', agencyName: 'Kiểm dịch', gate: null },
        ],
      });
      const epidemicItem = dong({
        epidemicFlag: true,
        activeSteps: [
          { code: 'IMPORT_QUARANTINE', name: 'Kiểm dịch kiểm tra nghiệp vụ', agencyCode: 'QUARANTINE', agencyName: 'Kiểm dịch', gate: null },
        ],
      });

      api.getWorkflowQueue.and.returnValue(of(trang([normalItem, epidemicItem])));
      taoTrang();

      expect(noiBo()['displayAgencies'](normalItem)).toBe('Biên phòng, Hải quan, Kiểm dịch');
      expect(noiBo()['displayAgencies'](epidemicItem)).toBe('Kiểm dịch');
    });

    it('displayStepSubtitle: hiển thị đúng tên bước đơn, chuỗi nhiều bước i18n, hoặc fallback bước hiện tại/không có bước chờ', () => {
      taoTrang();

      const itemMulti = dong({
        activeSteps: [
          { code: 'IMPORT_CUSTOMS', name: 'Hải quan kiểm tra', agencyCode: 'HQ', agencyName: 'Hải quan', gate: null },
          { code: 'IMPORT_BORDER', name: 'Biên phòng kiểm tra', agencyCode: 'BP', agencyName: 'Biên phòng', gate: null },
        ],
      });
      expect(noiBo()['displayStepSubtitle'](itemMulti)).toBe('Kiểm tra nghiệp vụ theo chuyên ngành');

      const itemSingle = dong({
        activeSteps: [
          { code: 'IMPORT_CUSTOMS', name: 'Hải quan kiểm tra nghiệp vụ', agencyCode: 'HQ', agencyName: 'Hải quan', gate: null },
        ],
      });
      expect(noiBo()['displayStepSubtitle'](itemSingle)).toBe('Hải quan kiểm tra nghiệp vụ');

      const itemCurrentOnly = dong({
        activeSteps: [],
        currentStep: { code: 'HQ_STEP', name: 'Bước hiện tại', agencyCode: 'HQ', agencyName: 'Hải quan', gate: null },
      });
      expect(noiBo()['displayStepSubtitle'](itemCurrentOnly)).toBe('Bước hiện tại');

      const itemNone = dong({
        activeSteps: [],
        currentStep: null,
      });
      expect(noiBo()['displayStepSubtitle'](itemNone)).toBe('Không còn bước chờ xử lý');
    });

    it('bấm làm mới thì gọi lại API', () => {
      taoTrang();
      const soLan = api.getWorkflowQueue.calls.count();

      noiBo()['reload']();

      expect(api.getWorkflowQueue.calls.count()).toBe(soLan + 1);
    });
  });
});
