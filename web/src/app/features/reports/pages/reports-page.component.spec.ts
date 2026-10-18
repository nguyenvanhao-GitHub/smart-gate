import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideEchartsCore } from 'ngx-echarts';
import { NEVER, of, throwError } from 'rxjs';
import { AccessProfile } from '../../../core/auth/access-control.model';
import { SESSION_STORAGE_KEY } from '../../../core/auth/session.storage';
import { ReportDefinition, ReportResult } from '../../../core/models/report.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { ReportsPageComponent } from './reports-page.component';

/**
 * UI-12 Báo cáo — thống kê (P5).
 *
 * Bộ test khóa ba thứ:
 *   1. **Biểu mẫu lọc dựng động từ `/reports/catalog`** — không hard-code ô lọc nào ở web.
 *   2. **Xuất Excel gửi ĐÚNG bộ lọc đang xem** (F58) — nếu lệch thì tệp tải về khác màn hình.
 *   3. Ba trạng thái tải / rỗng / lỗi và phân trang phía máy chủ.
 */

function bieuDoGiaLap() {
  return {
    setOption: () => undefined,
    resize: () => undefined,
    dispose: () => undefined,
    isDisposed: () => false,
    on: () => undefined,
    off: () => undefined,
    showLoading: () => undefined,
    hideLoading: () => undefined,
  };
}

function hoSoTruyCap(permissions: string[] = ['report.view', 'report.export']): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'thongke',
      displayName: 'Hoàng Văn Nam',
      title: 'Chuyên viên thống kê',
      email: 'nam@chc.gov.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: null,
    },
    roles: [{ code: 'BAO_CAO', name: 'Báo cáo', dataScope: 'ORGANIZATION' }],
    permissions,
    assignments: [],
    menu: [],
  };
}

const DANH_MUC: ReportDefinition[] = [
  {
    code: 'traffic-by-hour',
    name: 'Lưu lượng phương tiện theo giờ',
    group: 'Báo cáo, thống kê',
    description: 'Số lượt tiếp nhận và lượt qua cổng theo từng khung giờ.',
    filters: [
      { key: 'from', label: 'Từ ngày', type: 'date' },
      { key: 'to', label: 'Đến ngày', type: 'date' },
      {
        key: 'checkpoint',
        label: 'Cửa khẩu',
        type: 'select',
        options: [
          { value: 'A1', label: 'Cửa A1' },
          { value: 'B1', label: 'Cửa B1' },
        ],
      },
      { key: 'keyword', label: 'Từ khóa', type: 'text' },
    ],
  },
  {
    code: 'processing-time',
    name: 'Thời gian xử lý theo lực lượng',
    group: 'Hải quan',
    description: 'Thời gian xử lý trung bình của từng lực lượng.',
    filters: [{ key: 'agencyCode', label: 'Lực lượng', type: 'select', options: [{ value: 'CUSTOMS', label: 'Hải quan' }] }],
  },
];

function ketQua(mau: Partial<ReportResult> = {}): ReportResult {
  return {
    code: 'traffic-by-hour',
    name: 'Lưu lượng phương tiện theo giờ',
    generatedAt: '2026-07-23T03:30:00.000Z',
    columns: [
      { key: 'hour', label: 'Khung giờ', type: 'text' },
      { key: 'submitted', label: 'Hồ sơ tiếp nhận', type: 'number' },
      { key: 'avgTime', label: 'Thời gian xử lý', type: 'duration' },
    ],
    rows: [
      { hour: '07:00', submitted: 12, avgTime: 4530 },
      { hour: '08:00', submitted: 31, avgTime: 900 },
    ],
    total: 42,
    page: 1,
    pageSize: 10,
    summary: { submitted: 43 },
    drilldown: { route: '/declarations', queryParams: { from: '2026-07-23' } },
    ...mau,
  };
}

describe('ReportsPageComponent — báo cáo, thống kê', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<ReportsPageComponent>;
  let component: ReportsPageComponent;
  let router: Router;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function taoTrang(group = 'general'): void {
    TestBed.configureTestingModule({
      imports: [ReportsPageComponent],
      providers: [
        provideRouter([{ path: 'declarations', children: [] }]),
        provideEchartsCore({ echarts: () => Promise.resolve({ init: () => bieuDoGiaLap() }) }),
        { provide: ApiService, useValue: api },
      ],
    });

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);

    fixture = TestBed.createComponent(ReportsPageComponent);
    component = fixture.componentInstance;
    component.group = group;
    fixture.detectChanges();
  }

  function noiDungTrang(): string {
    return (fixture.nativeElement as HTMLElement).textContent || '';
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap() }));

    api = jasmine.createSpyObj<ApiService>('ApiService', ['getReportCatalog', 'queryReport', 'exportReport', 'getAccessProfile', 'logExportResult']);
    api.getReportCatalog.and.returnValue(of(DANH_MUC));
    api.queryReport.and.returnValue(of(ketQua()));
    api.exportReport.and.returnValue(of(new Blob(['x'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })));
    api.logExportResult.and.returnValue(of({ success: true }));
    api.getAccessProfile.and.returnValue(of(hoSoTruyCap()));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    sessionStorage.clear();
  });

  // ---------------------------------------------------------------------------
  describe('Danh mục và bộ lọc dựng động từ API', () => {
    it('nhóm báo cáo và tên báo cáo lấy nguyên từ /reports/catalog', () => {
      taoTrang();

      expect(api.getReportCatalog).toHaveBeenCalled();
      expect(noiBo()['groupOptions']().map((item: { value: string }) => item.value)).toEqual(['Báo cáo, thống kê', 'Hải quan']);
      expect(noiBo()['reportOptions']().map((item: { label: string }) => item.label)).toEqual(['Lưu lượng phương tiện theo giờ']);
      expect(noiDungTrang()).toContain('Lưu lượng phương tiện theo giờ');
    });

    it('dựng đúng số ô lọc và đúng kiểu control theo khai báo của báo cáo (đã loại bỏ ô Chốt/Cửa khẩu)', () => {
      taoTrang();
      const oLoc = fixture.nativeElement.querySelectorAll('.filters sg-form-field');

      expect(oLoc.length).toBe(3);
      expect(fixture.nativeElement.querySelectorAll('.filters sg-date-picker').length).toBe(2);
      expect(fixture.nativeElement.querySelectorAll('.filters sg-select').length).toBe(0);
      expect(fixture.nativeElement.querySelectorAll('.filters input[type="text"]').length).toBe(1);
    });

    it('SG-222 — bộ lọc Lực lượng loại bỏ lựa chọn Cơ quan thu phí', () => {
      taoTrang();
      const filter = {
        key: 'agencyCode',
        label: 'Lực lượng',
        type: 'select',
        options: [
          { value: '', label: 'All' },
          { value: 'BORDER_GUARD', label: 'Biên phòng' },
          { value: 'CUSTOMS', label: 'Hải quan' },
          { value: 'QUARANTINE', label: 'Kiểm dịch' },
          { value: 'FEE_COLLECTOR', label: 'Cơ quan thu phí' },
        ],
      };
      const options = noiBo()['optionsOf'](filter);
      expect(options).toEqual([
        { value: '', label: 'Tất cả' },
        { value: 'BORDER_GUARD', label: 'Biên phòng' },
        { value: 'CUSTOMS', label: 'Hải quan' },
        { value: 'QUARANTINE', label: 'Kiểm dịch' },
      ]);
    });

    it('SG-224 — danh sách dữ liệu dòng loại bỏ lực lượng Cơ quan thu phí khỏi biểu đồ và bảng', () => {
      api.queryReport.and.returnValue(
        of({
          code: 'decisions-by-force',
          name: 'Quyết định theo lực lượng',
          generatedAt: '2026-08-21T00:00:00.000Z',
          columns: [{ key: 'agencyName', label: 'Lực lượng', type: 'text' }],
          rows: [
            { agencyName: 'Biên phòng', count: 10 },
            { agencyName: 'Hải quan', count: 15 },
            { agencyName: 'Kiểm dịch', count: 8 },
            { agencyName: 'Cơ quan thu phí', count: 0 },
          ],
          total: 4,
          page: 1,
          pageSize: 10,
        }),
      );
      taoTrang();

      const rows = noiBo()['rows']();
      expect(rows.length).toBe(3);
      expect(rows.map((r: { agencyName: string }) => r.agencyName)).toEqual(['Biên phòng', 'Hải quan', 'Kiểm dịch']);
    });

    it('ô lọc dạng chọn dùng đúng danh sách giá trị API cấp', () => {
      taoTrang();
      const chon = noiBo()['optionsOf'](DANH_MUC[0].filters[2]);

      expect(chon).toEqual([
        { value: 'A1', label: 'Cửa A1' },
        { value: 'B1', label: 'Cửa B1' },
      ]);
    });

    it('đổi báo cáo thì dựng lại bộ lọc theo báo cáo mới, không giữ ô cũ', () => {
      taoTrang();
      noiBo()['setFilter']('keyword', 'nong san');

      noiBo()['chooseReport']('processing-time');
      fixture.detectChanges();

      expect(noiBo()['selected']().code).toBe('processing-time');
      expect(noiBo()['filterValues']).toEqual({ agencyCode: '' });
      expect(fixture.nativeElement.querySelectorAll('.filters sg-form-field').length).toBe(0);
    });

    it('tham số đường dẫn chỉ chọn báo cáo mở đầu — /reports/hai-quan mở nhóm Hải quan', () => {
      taoTrang('hai-quan');

      expect(noiBo()['selected']().code).toBe('processing-time');
    });

    it('không có báo cáo nào được cấp thì báo rõ qua toast, không hiện bảng rỗng vô nghĩa', () => {
      api.getReportCatalog.and.returnValue(of([]));
      taoTrang();

      const messages = TestBed.inject(AppMessageService).messages();
      expect(messages.some((m) => m.text.includes('chưa được cấp báo cáo nào'))).toBe(true);
      expect(api.queryReport).not.toHaveBeenCalled();
    });

    it('tự động tải lại kết quả khi thay đổi ô lọc mà không cần bấm Tìm kiếm (SG-175)', () => {
      taoTrang();
      api.queryReport.calls.reset();

      noiBo()['setFilter']('from', '2026-07-01');

      expect(api.queryReport).toHaveBeenCalledWith('traffic-by-hour', { from: '2026-07-01', page: 1, pageSize: 10 });
    });
  });

  // ---------------------------------------------------------------------------
  describe('Chạy báo cáo, trạng thái tải/rỗng/lỗi', () => {
    it('gửi bộ lọc đang nhập kèm phân trang lên /query', () => {
      taoTrang();
      noiBo()['setFilter']('from', '2026-07-01');
      noiBo()['setFilter']('checkpoint', 'B1');

      noiBo()['search']();

      expect(api.queryReport).toHaveBeenCalledWith('traffic-by-hour', { from: '2026-07-01', checkpoint: 'B1', page: 1, pageSize: 10 });
    });

    it('bỏ ô lọc rỗng, không gửi tham số thừa', () => {
      taoTrang();

      noiBo()['search']();

      expect(api.queryReport.calls.mostRecent().args[1]).toEqual({ page: 1, pageSize: 10 });
    });

    it('vẽ bảng theo đúng cột API trả và định dạng theo kiểu cột', () => {
      taoTrang();
      const tieuDe = Array.from(fixture.nativeElement.querySelectorAll('.grid thead th')).map((item) => (item as HTMLElement).textContent?.trim());
      const dongDau = fixture.nativeElement.querySelector('.grid tbody tr') as HTMLElement;

      expect(tieuDe).toEqual(['Khung giờ', 'Hồ sơ tiếp nhận', 'Thời gian xử lý']);
      expect(dongDau.textContent).toContain('07:00');
      expect(dongDau.textContent).toContain('1 giờ 15 phút');
    });

    it('đang tải thì hiện dòng chờ', () => {
      api.queryReport.and.returnValue(NEVER);
      taoTrang();

      expect(noiDungTrang()).toContain('Đang chạy báo cáo');
    });

    it('không có dòng nào thì hiện trạng thái rỗng có hướng dẫn', () => {
      api.queryReport.and.returnValue(of(ketQua({ rows: [], total: 0, summary: undefined, drilldown: undefined })));
      taoTrang();

      expect(noiDungTrang()).toContain('Không có dữ liệu khớp bộ lọc đang chọn');
    });

    it('API lỗi thì ưu tiên thông báo của API', () => {
      api.queryReport.and.returnValue(throwError(() => ({ status: 400, error: { message: 'Khoảng thời gian vượt quá 90 ngày.' } })));
      taoTrang();

      expect(noiBo()['error']()).toBe('Khoảng thời gian vượt quá 90 ngày.');
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.text.includes('Khoảng thời gian vượt quá 90 ngày.'))).toBe(true);
    });

    it('phân trang phía máy chủ: đổi trang thì gọi lại API với số trang mới', () => {
      taoTrang();

      noiBo()['goToPage'](2);

      expect(api.queryReport.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({ page: 2, pageSize: 10 }));
    });

    it('xóa bỏ phân trang tại bảng số liệu của cả 2 báo cáo Thời gian xử lý theo lực lượng và Quyết định theo lực lượng', () => {
      const processingTimeDef = {
        code: 'agency-processing-time',
        name: 'Thời gian xử lý theo lực lượng',
        group: 'Liên ngành',
        description: 'Mô tả',
        filters: [],
        columns: [{ key: 'agencyName', label: 'Lực lượng', type: 'text' }],
      };
      const decisionDef = {
        code: 'agency-decision',
        name: 'Quyết định theo lực lượng',
        group: 'Liên ngành',
        description: 'Mô tả',
        filters: [],
        columns: [{ key: 'agencyName', label: 'Lực lượng', type: 'text' }],
      };

      taoTrang();
      noiBo()['selected'].set(processingTimeDef as any);
      fixture.detectChanges();
      expect(noiBo()['hasPagination']()).toBe(false);
      expect(fixture.nativeElement.querySelector('.pager')).toBeNull();

      noiBo()['selected'].set(decisionDef as any);
      fixture.detectChanges();
      expect(noiBo()['hasPagination']()).toBe(false);
      expect(fixture.nativeElement.querySelector('.pager')).toBeNull();
    });

    it('chỉ số chính lấy nhãn từ cột cùng khóa', () => {
      taoTrang();

      expect(noiBo()['summaryCards']()).toEqual([{ key: 'submitted', label: 'Hồ sơ tiếp nhận', value: '43' }]);
    });

    it('chỉ số chính dossiers hiển thị nhãn Tổng số hồ sơ', () => {
      api.queryReport.and.returnValue(of(ketQua({ summary: { dossiers: 18, submitted: 12 } })));
      taoTrang();

      expect(noiBo()['summaryCards']()).toEqual([
        { key: 'dossiers', label: 'Tổng số hồ sơ', value: '18' },
        { key: 'submitted', label: 'Hồ sơ tiếp nhận', value: '12' },
      ]);
    });

    it('mở danh sách nguồn theo đúng drilldown API trả', () => {
      taoTrang();

      noiBo()['openDrilldown']();

      expect(router.navigate).toHaveBeenCalledWith(['/declarations'], { queryParams: { from: '2026-07-23' } });
    });
  });

  // ---------------------------------------------------------------------------
  describe('Biểu đồ', () => {
    it('dựng chuỗi số liệu từ đúng các cột number/duration của báo cáo', () => {
      taoTrang();
      const option = noiBo()['chartOption']() as Record<string, any>;

      expect(option['xAxis'].data).toEqual(['07:00', '08:00']);
      expect(option['series'].map((item: { name: string }) => item.name)).toEqual(['Hồ sơ tiếp nhận', 'Thời gian xử lý']);
      expect(option['series'][0].data).toEqual([12, 31]);
    });

    it('SG-177: định dạng thời lượng cho thẻ summary và tooltip biểu đồ khi cột mang kiểu duration', () => {
      taoTrang();
      const reportDef = {
        code: 'agency-processing-time',
        name: 'Thời gian xử lý theo lực lượng',
        group: 'Liên ngành',
        description: 'Mô tả',
        filters: [],
        columns: [
          { key: 'agencyName', label: 'Lực lượng', type: 'text' },
          { key: 'actions', label: 'Lượt xử lý', type: 'number' },
          { key: 'averageSeconds', label: 'Thời gian trung bình', type: 'duration' },
          { key: 'maxSeconds', label: 'Thời gian lâu nhất', type: 'duration' },
        ],
      };
      noiBo()['selected'].set(reportDef as any);
      noiBo()['result'].set({
        code: 'agency-processing-time',
        name: 'Thời gian xử lý theo lực lượng',
        generatedAt: new Date().toISOString(),
        columns: reportDef.columns,
        rows: [
          { agencyName: 'Biên phòng', actions: 5, averageSeconds: 90119, maxSeconds: 449977 },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
        summary: { averageSeconds: 90119, maxSeconds: 449977 },
      });
      fixture.detectChanges();

      const cards = noiBo()['summaryCards']();
      const avgCard = cards.find((c: { key: string; value: string }) => c.key === 'averageSeconds');
      expect(avgCard?.value).toBe('1 ngày 1 giờ 1 phút');

      const option = noiBo()['chartOption']();
      expect(option?.tooltip?.formatter).toBeDefined();
      const formatter = option?.tooltip?.formatter as (params: { name: string; seriesName: string; value: number; marker: string }[]) => string;
      if (typeof formatter === 'function') {
        const formatted = formatter([
          { name: 'Biên phòng', seriesName: 'Thời gian trung bình', value: 90119, marker: '' },
        ]);
        expect(formatted).toContain('1 ngày 1 giờ 1 phút');
      }
    });

    it('SG-178: vẽ biểu đồ theo 4 nhóm hành động và bảng chi tiết số liệu cho báo cáo Nhật ký qua cổng', () => {
      const reportDef = {
        code: 'gate-event',
        name: 'Nhật ký qua cổng',
        group: 'Cổng',
        description: 'Mô tả',
        filters: [],
        columns: [
          { key: 'occurredAt', label: 'Thời điểm', type: 'date' },
          { key: 'dossierCode', label: 'Mã hồ sơ', type: 'text' },
          { key: 'decision', label: 'Kết quả', type: 'text' },
        ],
      };
      taoTrang();
      noiBo()['selected'].set(reportDef as any);
      noiBo()['result'].set({
        code: 'gate-event',
        name: 'Nhật ký qua cổng',
        generatedAt: new Date().toISOString(),
        columns: reportDef.columns,
        rows: [
          { occurredAt: '2026-08-20T08:00:00.000Z', dossierCode: 'HS-1', direction: 'Vào', decision: 'Cho qua' },
          { occurredAt: '2026-08-20T09:00:00.000Z', dossierCode: 'HS-2', direction: 'Vào', decision: 'Từ chối' },
          { occurredAt: '2026-08-19T10:00:00.000Z', dossierCode: 'HS-3', direction: 'Ra', decision: 'Cho qua' },
        ],
        total: 26,
        page: 1,
        pageSize: 10,
        summary: {
          events: 26,
          entryAllow: 15,
          entryDeny: 2,
          exitAllow: 8,
          exitDeny: 1,
        },
      });
      fixture.detectChanges();

      expect(noiBo()['chartTitle']()).toBe('Biểu đồ theo hành động');

      const cards = noiBo()['summaryCards']();
      expect(cards.length).toBe(1);
      const eventCard = cards.find((c: { key: string; value: string }) => c.key === 'events');
      expect(eventCard?.label).toBe('Sự kiện');
      expect(eventCard?.value).toBe('26');

      const actionItems = noiBo()['gateActionItems']();
      expect(actionItems.length).toBe(4);
      expect(actionItems.map((i: { label: string; count: number }) => ({ label: i.label, count: i.count }))).toEqual([
        { label: 'Xác nhận vào cổng', count: 15 },
        { label: 'Từ chối vào cổng', count: 2 },
        { label: 'Xác nhận ra cổng', count: 8 },
        { label: 'Từ chối ra cổng', count: 1 },
      ]);

      const option = noiBo()['chartOption']() as Record<string, any>;
      expect(option).not.toBeNull();
      expect(option['xAxis'].data).toEqual([
        'Xác nhận vào cổng',
        'Từ chối vào cổng',
        'Xác nhận ra cổng',
        'Từ chối ra cổng',
      ]);
      expect(option['series'][0].data).toEqual([15, 2, 8, 1]);

      const table = noiBo()['chartTable']();
      expect(table.columns).toEqual(['Hành động', 'Số lượt']);
      expect(table.rows).toEqual([
        ['Xác nhận vào cổng', 15],
        ['Từ chối vào cổng', 2],
        ['Xác nhận ra cổng', 8],
        ['Từ chối ra cổng', 1],
      ]);

      // Kiểm tra mở drilldown từ nút Mở danh sách nguồn
      noiBo()['openDrilldown']();
      expect(router.navigate).toHaveBeenCalledWith(['/operations/vehicles-entered-gate'], {
        queryParams: {},
        fragment: 'recent-events',
      });

      // Kiểm tra click cột hành động
      noiBo()['onChartClick']({ name: 'Từ chối vào cổng' });
      expect(router.navigate).toHaveBeenCalledWith(['/operations/vehicles-entered-gate'], {
        queryParams: { direction: 'ENTRY', decision: 'DENY' },
        fragment: 'recent-events',
      });
    });

    it('mô tả bằng lời cho trình đọc màn hình và không hiển thị bảng số liệu trùng lặp ở biểu đồ', () => {
      taoTrang();

      expect(noiBo()['chartTable']().columns).toEqual(['Khung giờ', 'Hồ sơ tiếp nhận', 'Thời gian xử lý']);
      expect(noiBo()['chartAria']()).toContain('Bảng số liệu chi tiết');
      expect(noiDungTrang()).not.toContain('Xem bảng số liệu');
    });

    it('báo cáo không có số liệu thì không vẽ biểu đồ, báo rõ lý do', () => {
      api.queryReport.and.returnValue(
        of(ketQua({ columns: [{ key: 'hour', label: 'Khung giờ', type: 'text' }], rows: [] })),
      );
      taoTrang();

      expect(noiBo()['chartOption']()).toBeNull();
      expect(noiDungTrang()).toContain('chưa có cột số liệu nào để vẽ biểu đồ');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Xuất Excel (F58)', () => {
    beforeEach(() => {
      spyOn(URL, 'createObjectURL').and.returnValue('blob:gia-lap');
      spyOn(URL, 'revokeObjectURL');
      spyOn(HTMLAnchorElement.prototype, 'click');
    });

    it('gửi ĐÚNG bộ lọc đang xem, không kèm phân trang (xuất toàn bộ dữ liệu)', () => {
      taoTrang();
      noiBo()['setFilter']('from', '2026-07-01');
      noiBo()['setFilter']('to', '2026-07-23');
      noiBo()['setFilter']('checkpoint', 'B1');
      noiBo()['search']();

      noiBo()['exportExcel']();

      expect(api.exportReport).toHaveBeenCalledWith('traffic-by-hour', { from: '2026-07-01', to: '2026-07-23', checkpoint: 'B1' });
    });

    it('bộ lọc gửi khi xuất trùng khớp bộ lọc vừa dùng để truy vấn', () => {
      taoTrang();
      noiBo()['setFilter']('keyword', 'nong san');
      noiBo()['search']();

      noiBo()['exportExcel']();

      const locTruyVan = { ...api.queryReport.calls.mostRecent().args[1] };
      delete locTruyVan['page'];
      delete locTruyVan['pageSize'];
      expect(api.exportReport.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining(locTruyVan));
      expect(Object.keys(api.exportReport.calls.mostRecent().args[1]).sort()).toEqual(Object.keys(locTruyVan).sort());
    });

    it('SG-179: xuất xong thì tải tệp .xlsx đúng tên bao-cao-<mã>-<ngày-giờ>.xlsx và báo thành công', async () => {
      let filenameTaiVe = '';
      spyOnProperty(HTMLAnchorElement.prototype, 'download', 'set').and.callFake((val: string) => {
        filenameTaiVe = val;
      });

      taoTrang();
      noiBo()['exportExcel']();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });

      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
      expect(filenameTaiVe).toMatch(/^bao-cao-traffic-by-hour-\d{4}-\d{2}-\d{2}_\d{2}h\d{2}\.xlsx$/);
      const messages = TestBed.inject(AppMessageService).messages();
      expect(messages.some((m) => m.tone === 'success' && m.text.includes('Đã tải tệp Excel'))).toBe(true);
    });

    it('SG-225: khi người dùng hủy tại cửa sổ Save As -> hiển thị thông báo Hủy, không báo Thành công', async () => {
      const abortErr = new Error('The user aborted a request.');
      abortErr.name = 'AbortError';
      (window as unknown as Record<string, unknown>)['showSaveFilePicker'] = jasmine.createSpy('showSaveFilePicker').and.rejectWith(abortErr);

      taoTrang();
      noiBo()['exportExcel']();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });

      const messages = TestBed.inject(AppMessageService).messages();
      expect(messages.some((m) => m.tone === 'success')).toBe(false);
      expect(messages.some((m) => m.tone === 'info')).toBe(true);
      delete (window as unknown as Record<string, unknown>)['showSaveFilePicker'];
    });

    it('xuất lỗi thì hiện thông báo của API qua toast, không im lặng', async () => {
      api.exportReport.and.returnValue(throwError(() => ({ status: 500, error: { message: 'Máy chủ báo cáo đang bận.' } })));
      taoTrang();

      noiBo()['exportExcel']();
      await new Promise((resolve) => { setTimeout(resolve, 50); });
      await fixture.whenStable();

      const messages = TestBed.inject(AppMessageService).messages();
      expect(messages.some((m) => m.tone === 'error' && m.text.includes('Máy chủ báo cáo đang bận.'))).toBe(true);
    });

    it('thiếu quyền report.export thì không hiện nút xuất Excel', () => {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap(['report.view']) }));
      taoTrang();

      expect(noiBo()['canExport']()).toBe(false);
      expect(noiDungTrang()).not.toContain('Xuất Excel');
    });

    it('chuyển ngôn ngữ sang Tiếng Anh thì dịch nhóm, tiêu đề, mô tả và tiêu đề cột', () => {
      taoTrang();
      const i18n = TestBed.inject(I18nService);
      i18n.setLocale('en');
      fixture.detectChanges();

      expect(noiBo()['groupName']('Hồ sơ')).toBe('Dossier');
      expect(noiBo()['groupName']('Liên ngành')).toBe('Inter-agency');
      expect(noiBo()['groupName']('Cổng')).toBe('Gate');
      expect(noiBo()['groupName']('Kho bãi')).toBe('Yard & Warehouse');

      expect(noiBo()['columnLabel']({ key: 'date', label: 'Ngày', type: 'date' })).toBe('Date');
      expect(noiBo()['columnLabel']({ key: 'created', label: 'Hồ sơ tạo', type: 'number' })).toBe('Created');
      expect(noiBo()['columnLabel']({ key: 'submitted', label: 'Đã gửi', type: 'number' })).toBe('Submitted');
      expect(noiBo()['columnLabel']({ key: 'completed', label: 'Hoàn thành', type: 'number' })).toBe('Completed');
      expect(noiBo()['columnLabel']({ key: 'rejected', label: 'Từ chối', type: 'number' })).toBe('Rejected');

      // Gate log
      expect(noiBo()['columnLabel']({ key: 'dossierCode', label: 'Mã hồ sơ' })).toBe('Dossier code');
      expect(noiBo()['columnLabel']({ key: 'plate', label: 'Biển số xe' })).toBe('License plate');
      expect(noiBo()['columnLabel']({ key: 'gate', label: 'Cổng' })).toBe('Gate');
      expect(noiBo()['columnLabel']({ key: 'direction', label: 'Chiều' })).toBe('Direction');
      expect(noiBo()['columnLabel']({ key: 'result', label: 'Kết quả' })).toBe('Result');
      expect(noiBo()['columnLabel']({ key: 'light', label: 'Đèn' })).toBe('Signal light');
      expect(noiBo()['columnLabel']({ key: 'recorder', label: 'Người ghi nhận' })).toBe('Recorded by');
      expect(noiBo()['columnLabel']({ key: 'note', label: 'Ghi chú' })).toBe('Notes');

      // Yard inventory
      expect(noiBo()['columnLabel']({ key: 'zone_code', label: 'Mã khu' })).toBe('Zone code');
      expect(noiBo()['columnLabel']({ key: 'zone_name', label: 'Tên khu' })).toBe('Zone name');
      expect(noiBo()['columnLabel']({ key: 'capacity', label: 'Sức chứa công bố' })).toBe('Published capacity');
      expect(noiBo()['columnLabel']({ key: 'open_slots', label: 'Số ô đang mở' })).toBe('Open slots');
      expect(noiBo()['columnLabel']({ key: 'occupied_slots', label: 'Ô đang có xe' })).toBe('Occupied slots');
      expect(noiBo()['columnLabel']({ key: 'available_slots', label: 'Ô còn trống' })).toBe('Available slots');

      // Decisions by force
      expect(noiBo()['columnLabel']({ label: 'Yêu cầu sửa đổi, bổ sung' })).toBe('Revision requested');
      expect(noiBo()['columnLabel']({ label: 'Chấp nhận' })).toBe('Approved');

      // Filter labels
      expect(noiBo()['filterLabel']({ key: 'agencyCode', label: 'Lực lượng', type: 'select' })).toBe('Agency');

      expect(noiBo()['chartTitle']()).toBe('Chart by time');

      i18n.setLocale('vi');
    });

    it('SG-225: khi xuất báo cáo bị hủy (CANCELLED) hoặc thất bại (FAILED), gọi logExportResult báo về máy chủ', async () => {
      taoTrang();
      const abortErr = new Error('The user aborted a request.');
      abortErr.name = 'AbortError';
      (window as unknown as Record<string, unknown>)['showSaveFilePicker'] = jasmine.createSpy('showSaveFilePicker').and.rejectWith(abortErr);

      noiBo()['exportExcel']();
      await fixture.whenStable();

      expect(api.logExportResult).toHaveBeenCalledWith(
        jasmine.objectContaining({
          action: 'REPORT_EXPORT',
          targetType: 'REPORT',
          result: 'CANCELLED',
        }),
      );
      delete (window as unknown as Record<string, unknown>)['showSaveFilePicker'];
    });
  });
});
