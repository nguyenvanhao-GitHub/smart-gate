import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideEchartsCore } from 'ngx-echarts';
import { NEVER, of, throwError } from 'rxjs';
import { AccessProfile } from '../../../core/auth/access-control.model';
import { SESSION_STORAGE_KEY } from '../../../core/auth/session.storage';
import { DashboardKpi, DashboardOverview } from '../../../core/models/dashboard.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { DashboardPageComponent } from './dashboard-page.component';

/**
 * UI-02 Dashboard tổng quan (P5).
 *
 * Bộ test khóa ba thứ:
 *   1. **Drill-down đúng cái API trả** — điều kiện nghiệm thu mốc M3. Bấm KPI phải điều hướng
 *      theo nguyên `drilldown.route` + `queryParams`, không được web tự ghép đường dẫn.
 *   2. Ba trạng thái tải / rỗng / lỗi của cả trang lẫn biểu đồ (SRS 8.1).
 *   3. Không có bản đồ và không có cảnh báo SLA trong phần dữ liệu nghiệp vụ (A0 + D5).
 */

/** ECharts giả lập: test không vẽ biểu đồ thật, chỉ kiểm cấu hình và bảng số liệu. */
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

function hoSoTruyCap(permissions: string[] = ['dossier.view', 'report.view']): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'lanhdao',
      displayName: 'Nguyễn Văn A',
      title: 'Lãnh đạo cửa khẩu',
      email: 'a@chc.gov.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: null,
    },
    roles: [{ code: 'LANH_DAO', name: 'Lãnh đạo', dataScope: 'ALL' }],
    permissions,
    assignments: [],
    menu: [],
  };
}

function chiSo(mau: Partial<DashboardKpi> = {}): DashboardKpi {
  return {
    key: 'submitted-today',
    label: 'Hồ sơ tiếp nhận hôm nay',
    value: 256,
    tone: 'processing',
    drilldown: { route: '/declarations', queryParams: { status: 'SUBMITTED', from: '2026-07-23' } },
    ...mau,
  };
}

function tongQuan(mau: Partial<DashboardOverview> = {}): DashboardOverview {
  return {
    generatedAt: '2026-07-23T03:30:00.000Z',
    kpis: [
      chiSo(),
      chiSo({
        key: 'waiting-vehicles',
        label: 'Phương tiện đang chờ',
        value: 48,
        tone: 'waiting',
        drilldown: { route: '/operations/vehicle-confirmation', queryParams: { checkpoint: 'A1' } },
      }),
    ],
    hourly: [
      { hour: '07:00', submitted: 12, passed: 8 },
      { hour: '08:00', submitted: 31, passed: 20 },
    ],
    byForce: [
      { agencyCode: 'CUSTOMS', agencyName: 'Hải quan', waiting: 5, processing: 3, completed: 20 },
      { agencyCode: 'BORDER_GUARD', agencyName: 'Biên phòng', waiting: 2, processing: 6, completed: 18 },
    ],
    alerts: [
      { level: 'WARN', message: 'Hồ sơ HS-250519-0015 đang chờ bổ sung chứng từ.', dossierId: 'hs-1', dossierCode: 'HS-250519-0015' },
      { level: 'INFO', message: 'Đã tiếp nhận 12 hồ sơ mới trong 1 giờ qua.' },
    ],
    ...mau,
  };
}

describe('DashboardPageComponent — tổng quan điều hành', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<DashboardPageComponent>;
  let component: DashboardPageComponent;
  let router: Router;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function taoTrang(): void {
    TestBed.configureTestingModule({
      imports: [DashboardPageComponent],
      providers: [
        provideRouter([
          { path: 'declarations/:id', children: [] },
          { path: 'workflow/dossiers/:id', children: [] },
        ]),
        provideEchartsCore({ echarts: () => Promise.resolve({ init: () => bieuDoGiaLap() }) }),
        { provide: ApiService, useValue: api },
      ],
    });

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);

    fixture = TestBed.createComponent(DashboardPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function noiDungTrang(): string {
    return (fixture.nativeElement as HTMLElement).textContent || '';
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap() }));

    api = jasmine.createSpyObj<ApiService>('ApiService', ['getDashboardOverview', 'getAccessProfile', 'getCheckpoints']);
    api.getDashboardOverview.and.returnValue(of(tongQuan()));
    api.getAccessProfile.and.returnValue(of(hoSoTruyCap()));
    api.getCheckpoints.and.returnValue(of([]));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    sessionStorage.clear();
  });

  // ---------------------------------------------------------------------------
  describe('Trạng thái tải, rỗng và lỗi (SRS 8.1)', () => {
    it('đang tải thì hiện dòng chờ, không hiện thẻ KPI', () => {
      api.getDashboardOverview.and.returnValue(NEVER);
      taoTrang();

      expect(noiBo()['loading']()).toBe(true);
      expect(noiDungTrang()).toContain('Đang tải chỉ số tổng quan');
      expect(fixture.nativeElement.querySelectorAll('.kpi').length).toBe(0);
    });

    it('API trả rỗng thì báo chưa có chỉ số và biểu đồ báo trống', () => {
      api.getDashboardOverview.and.returnValue(of(tongQuan({ kpis: [], hourly: [], byForce: [], alerts: [] })));
      taoTrang();

      const noiDung = noiDungTrang();
      expect(noiDung).toContain('Chưa có chỉ số nào');
      expect(noiDung).toContain('Chưa có lượt tiếp nhận hay lượt qua cổng nào');
      expect(noiDung).toContain('Không có cảnh báo nào');
    });

    it('API lỗi thì hiện thông báo lỗi và biểu đồ cũng báo lỗi, không để trắng', () => {
      api.getDashboardOverview.and.returnValue(throwError(() => new Error('mat ket noi')));
      taoTrang();

      expect(noiBo()['error']()).toContain('Không tải được số liệu tổng quan');
      expect(noiBo()['chartError']()).toContain('Không tải được số liệu biểu đồ');
      expect(noiDungTrang()).toContain('Không tải được số liệu biểu đồ');
    });

    it('gửi đúng bộ lọc khoảng ngày lên API', () => {
      taoTrang();
      noiBo()['filters'].from = '2026-07-01';
      noiBo()['filters'].to = '2026-07-23';

      noiBo()['reload']();

      expect(api.getDashboardOverview.calls.mostRecent().args[0]).toEqual({ from: '2026-07-01', to: '2026-07-23' });
    });

    it('bấm Làm mới đưa toàn bộ bộ lọc về trạng thái mặc định rỗng', () => {
      taoTrang();
      noiBo()['filters'].from = '2026-07-01';
      noiBo()['filters'].to = '2026-07-23';

      noiBo()['resetFilters']();

      expect(noiBo()['filters']).toEqual({ from: '', to: '' });
      expect(api.getDashboardOverview.calls.mostRecent().args[0]).toEqual({ from: undefined, to: undefined });
    });

    it('Từ ngày muộn hơn Đến ngày thì chặn ở web và báo lỗi', () => {
      taoTrang();
      const count = api.getDashboardOverview.calls.count();
      noiBo()['filters'].from = '2026-07-31';
      noiBo()['filters'].to = '2026-07-01';

      noiBo()['reload']();

      expect(api.getDashboardOverview.calls.count()).toBe(count);
      expect(noiBo()['error']()).toContain('Từ ngày phải trước hoặc bằng Đến ngày');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Drill-down từ KPI sang danh sách nguồn (DoD mốc M3)', () => {
    it('bấm KPI thì điều hướng ĐÚNG route và queryParams do API trả', () => {
      taoTrang();
      const the = fixture.nativeElement.querySelectorAll('.kpi') as NodeListOf<HTMLButtonElement>;

      the[0].click();

      expect(router.navigate).toHaveBeenCalledWith(['/declarations'], { queryParams: { status: 'SUBMITTED', from: '2026-07-23' } });
    });

    it('mỗi KPI đi tới đúng danh sách của riêng nó, không dùng chung một đường dẫn', () => {
      taoTrang();
      const the = fixture.nativeElement.querySelectorAll('.kpi') as NodeListOf<HTMLButtonElement>;

      the[1].click();

      expect(router.navigate).toHaveBeenCalledWith(['/operations/vehicle-confirmation'], { queryParams: { checkpoint: 'A1' } });
    });

    it('KPI thiếu drilldown thì báo rõ, tuyệt đối không tự đoán đường dẫn', () => {
      taoTrang();

      noiBo()['openDrilldown']({ key: 'x', label: 'Chỉ số lạ', value: 1, drilldown: null } as unknown as DashboardKpi);

      expect(router.navigate).not.toHaveBeenCalled();
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.text.includes('chưa có danh sách nguồn'))).toBe(true);
    });

    it('thẻ KPI hiện nhãn, giá trị và mời mở danh sách', () => {
      taoTrang();
      const the = fixture.nativeElement.querySelector('.kpi') as HTMLElement;

      expect(the.textContent).toContain('Hồ sơ tiếp nhận hôm nay');
      expect(the.textContent).toContain('256');
      expect(the.textContent).toContain('Xem danh sách');
      expect(the.getAttribute('aria-label')).toContain('Xem danh sách: Hồ sơ tiếp nhận hôm nay');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Biểu đồ theo giờ và trạng thái theo lực lượng', () => {
    it('biểu đồ theo giờ dựng đúng 2 chuỗi số liệu từ dữ liệu API', () => {
      taoTrang();
      const option = noiBo()['hourlyOption']() as any;

      expect(option.xAxis.data).toEqual(['07:00', '08:00']);
      expect(option.series[0].name).toBe('Hồ sơ tiếp nhận');
      expect(option.series[0].data).toEqual([12, 31]);
      expect(option.series[1].name).toBe('Phương tiện qua cổng');
      expect(option.series[1].data).toEqual([8, 20]);
    });

    it('biểu đồ theo lực lượng xếp chồng 3 trạng thái theo đúng thứ tự API trả', () => {
      taoTrang();
      const option = noiBo()['forceOption']() as any;

      expect(option.yAxis.data).toEqual(['Hải quan', 'Biên phòng']);
      expect(option.series.map((item: { name: string }) => item.name)).toEqual(['Đang chờ', 'Đang xử lý nghiệp vụ', 'Đã hoàn thành']);
      expect(option.series[2].data).toEqual([20, 18]);
    });

    it('mỗi biểu đồ kèm bảng số liệu và mô tả bằng lời cho trình đọc màn hình', () => {
      taoTrang();

      expect(noiBo()['hourlyTable']().rows).toEqual([
        ['07:00', 12, 8],
        ['08:00', 31, 20],
      ]);
      expect(noiBo()['forceTable']().columns).toEqual(['Lực lượng', 'Đang chờ', 'Đang xử lý nghiệp vụ', 'Đã hoàn thành']);
      expect(noiBo()['hourlyAria']()).toContain('tổng 43 hồ sơ tiếp nhận và 28 phương tiện qua cổng');
      expect(noiBo()['forceAria']()).toContain('7 hồ sơ đang chờ, 9 đang xử lý nghiệp vụ, 38 đã hoàn thành');
      expect(noiDungTrang()).toContain('Xem bảng số liệu');
    });

    it('không có số liệu thì không dựng cấu hình biểu đồ (tránh canvas trắng)', () => {
      api.getDashboardOverview.and.returnValue(of(tongQuan({ hourly: [], byForce: [] })));
      taoTrang();

      expect(noiBo()['hourlyOption']()).toBeNull();
      expect(noiBo()['forceOption']()).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Cảnh báo và phạm vi màn hình', () => {
    it('hiện đúng danh sách cảnh báo API trả, có liên kết tới hồ sơ khi có mã', () => {
      taoTrang();
      const canhBao = Array.from(fixture.nativeElement.querySelectorAll('.alert')) as HTMLElement[];

      expect(canhBao.length).toBe(2);
      expect(canhBao[0].textContent).toContain('Hồ sơ HS-250519-0015 đang chờ bổ sung');
      expect(canhBao[0].querySelector('a')?.textContent).toContain('HS-250519-0015');
      expect(canhBao[1].querySelector('a')).toBeNull();
    });

    it('không vẽ bản đồ và không tự sinh cảnh báo quá hạn/SLA (quyết định A0, điểm D5)', () => {
      taoTrang();
      const kpi = (fixture.nativeElement.querySelector('.kpis') as HTMLElement).textContent || '';
      const bieuDo = (fixture.nativeElement.querySelector('.insight') as HTMLElement).textContent || '';
      const hangGap = (fixture.nativeElement.querySelector('.grid3') as HTMLElement).textContent || '';
      const canhBao = (fixture.nativeElement.querySelector('.alerts') as HTMLElement).textContent || '';
      const noiDungNghiepVu = `${kpi}${bieuDo}${hangGap}${canhBao}`;

      expect(noiDungNghiepVu).not.toContain('SLA');
      expect(noiDungNghiepVu).not.toContain('quá hạn');
      expect(noiDungNghiepVu).not.toContain('Bản đồ');
      expect(fixture.nativeElement.querySelector('svg')).toBeNull();
      expect(noiDungTrang()).toContain('Tổng quan hoạt động cửa khẩu');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Donut cơ cấu hồ sơ theo trạng thái (Đợt 2)', () => {
    it('chỉ lấy KPI CÓ lọc trạng thái, loại KPI tổng khỏi donut', () => {
      api.getDashboardOverview.and.returnValue(
        of(
          tongQuan({
            kpis: [
              chiSo({ key: 'total', label: 'Tổng hồ sơ', value: 100, drilldown: { route: '/declarations', queryParams: {} } }),
              chiSo({ key: 'submitted', label: 'Đã tiếp nhận', value: 60, tone: 'processing', drilldown: { route: '/declarations', queryParams: { status: 'SUBMITTED' } } }),
              chiSo({ key: 'rejected', label: 'Từ chối', value: 8, tone: 'rejected', drilldown: { route: '/declarations', queryParams: { status: 'REJECTED' } } }),
            ],
          }),
        ),
      );
      taoTrang();

      const slices = noiBo()['statusSlices']() as DashboardKpi[];
      expect(slices.map((kpi) => kpi.key)).toEqual(['submitted', 'rejected']);
      expect(noiBo()['donutTable']().rows).toEqual([
        ['Đã tiếp nhận', 60],
        ['Từ chối', 8],
      ]);

      const option = noiBo()['statusDonutOption']() as any;
      expect(option.series[0].type).toBe('pie');
      expect(option.series[0].data.map((slice: { value: number }) => slice.value)).toEqual([60, 8]);
    });

    it('gồm cả KPI lọc theo NHÓM trạng thái (statusGroup), loại KPI đo lượt xe qua cổng', () => {
      api.getDashboardOverview.and.returnValue(
        of(
          tongQuan({
            kpis: [
              chiSo({ key: 'total', label: 'Tổng hồ sơ', value: 100, drilldown: { route: '/declarations', queryParams: {} } }),
              chiSo({ key: 'processing', label: 'Đang xử lý', value: 40, tone: 'processing', drilldown: { route: '/declarations', queryParams: { statusGroup: 'IN_PROGRESS' } } }),
              // Thẻ "Xe đã rời" đo lượt xe qua cổng — không mang tham số trạng thái, phải bị loại khỏi donut cơ cấu hồ sơ.
              chiSo({ key: 'exited', label: 'Xe đã rời', value: 15, tone: 'done', drilldown: { route: '/operations/vehicles-entered-gate', queryParams: {} } }),
            ],
          }),
        ),
      );
      taoTrang();

      const slices = noiBo()['statusSlices']() as DashboardKpi[];
      expect(slices.map((kpi) => kpi.key)).toEqual(['processing']);
    });

    it('không có KPI trạng thái nào thì donut báo trống, không dựng cấu hình (tránh canvas trắng)', () => {
      api.getDashboardOverview.and.returnValue(
        of(tongQuan({ kpis: [chiSo({ key: 'total', label: 'Tổng hồ sơ', value: 100, drilldown: { route: '/declarations', queryParams: {} } })] })),
      );
      taoTrang();

      expect(noiBo()['statusSlices']().length).toBe(0);
      expect(noiBo()['statusDonutOption']()).toBeNull();
      expect(noiDungTrang()).toContain('Chưa có hồ sơ theo trạng thái nào');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Panel tình hình cửa khẩu (gateYard) — Đợt 2', () => {
    function tongQuanGate(): DashboardOverview {
      return tongQuan({
        gateYard: {
          yards: [
            { yardName: 'Khu A', occupied: 12, slots: 20 },
            { yardName: 'Khu B', occupied: 20, slots: 20 },
          ],
          gatePassedToday: 37,
          gateDeniedToday: 4,
          queueWaiting: 9,
        },
      });
    }

    it('hiện đủ 3 số cổng/hàng đợi hôm nay', () => {
      api.getDashboardOverview.and.returnValue(of(tongQuanGate()));
      taoTrang();

      const panel = fixture.nativeElement.querySelector('.gate-stats') as HTMLElement;
      expect(panel.textContent).toContain('37');
      expect(panel.textContent).toContain('4');
      expect(panel.textContent).toContain('9');
      expect(panel.textContent).toContain('Qua cổng hôm nay');
      expect(panel.textContent).toContain('Bị từ chối hôm nay');
      expect(panel.textContent).toContain('Đang chờ hàng đợi');
    });

    it('mỗi khu bãi vẽ thanh occupancy đúng tỷ lệ; khu kín chỗ đạt 100%', () => {
      api.getDashboardOverview.and.returnValue(of(tongQuanGate()));
      taoTrang();

      const yards = Array.from(fixture.nativeElement.querySelectorAll('.yard')) as HTMLElement[];
      expect(yards.length).toBe(2);
      expect(yards[0].textContent).toContain('12/20');
      expect(yards[1].textContent).toContain('20/20');
      expect(noiBo()['yardPercent']({ yardName: 'Khu A', occupied: 12, slots: 20 })).toBe(60);
      expect(noiBo()['yardPercent']({ yardName: 'Khu B', occupied: 20, slots: 20 })).toBe(100);
    });

    it('không có khu bãi (tài khoản hạn chế) thì báo trống nhưng vẫn hiện 3 số', () => {
      api.getDashboardOverview.and.returnValue(
        of(tongQuan({ gateYard: { yards: [], gatePassedToday: 2, gateDeniedToday: 0, queueWaiting: 1 } })),
      );
      taoTrang();

      expect(noiDungTrang()).toContain('Chưa có số liệu khu bãi');
      expect((fixture.nativeElement.querySelector('.gate-stats') as HTMLElement).textContent).toContain('2');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Panel cần xử lý sớm (attention) — Đợt 2', () => {
    function tongQuanAttention(): DashboardOverview {
      return tongQuan({
        attention: [
          {
            dossierId: 'hs-10',
            dossierCode: 'CK-0010',
            enterpriseName: 'Cty TNHH XYT Thương Mại',
            type: 'IMPORT',
            stepLabel: 'Hải quan - kiểm tra tờ khai nhập',
            waitingSince: '2026-07-22T01:00:00.000Z',
          },
          {
            dossierId: 'hs-11',
            dossierCode: 'CK-0011',
            enterpriseName: '',
            type: 'EXPORT',
            stepLabel: 'Kiểm dịch - luồng xuất',
            waitingSince: '2026-07-22T03:00:00.000Z',
          },
        ],
      });
    }

    it('mỗi dòng bảng gấp mở màn xử lý của ĐÚNG hồ sơ qua /workflow/dossiers/:id', () => {
      api.getDashboardOverview.and.returnValue(of(tongQuanAttention()));
      taoTrang();

      const items = Array.from(fixture.nativeElement.querySelectorAll('tr.attention__item')) as HTMLElement[];
      expect(items.length).toBe(2);
      expect(items[0].textContent).toContain('CK-0010');

      const link = items[0].querySelector('a.attention__code') as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe('/workflow/dossiers/hs-10');
      const link2 = items[1].querySelector('a.attention__code') as HTMLAnchorElement;
      expect(link2.getAttribute('href')).toBe('/workflow/dossiers/hs-11');
    });

    it('bảng gấp hiện đủ cột DN/Loại/Chờ từ với dữ liệu thật, DN rỗng thì hiện dấu gạch', () => {
      api.getDashboardOverview.and.returnValue(of(tongQuanAttention()));
      taoTrang();

      const head = (fixture.nativeElement.querySelector('table.attention thead') as HTMLElement).textContent || '';
      expect(head).toContain('Doanh nghiệp');
      expect(head).toContain('Loại');
      expect(head).toContain('Đang chờ ở bước');
      expect(head).toContain('Chờ từ');

      const items = Array.from(fixture.nativeElement.querySelectorAll('tr.attention__item')) as HTMLElement[];
      expect(items[0].textContent).toContain('Cty TNHH XYT Thương Mại');
      expect(items[0].textContent).toContain('Nhập khẩu');
      // Bước đang chờ (lực lượng nào) là thông tin quan trọng nhất — phải hiện trong bảng.
      expect(items[0].querySelector('.attention__step')?.textContent?.trim()).toBe('Hải quan - kiểm tra tờ khai nhập');
      expect(items[1].querySelector('.attention__step')?.textContent?.trim()).toBe('Kiểm dịch - luồng xuất');
      // Hồ sơ không có tên doanh nghiệp thì hiện "—", không để trống lấp lửng.
      expect(items[1].querySelector('.attention__enterprise')?.textContent?.trim()).toBe('—');
      expect(items[1].textContent).toContain('Xuất khẩu');
    });

    it('không có hồ sơ chờ thì báo trống, KHÔNG suy ra "quá hạn" hay "SLA"', () => {
      api.getDashboardOverview.and.returnValue(of(tongQuan({ attention: [] })));
      taoTrang();

      const panel = fixture.nativeElement.querySelector('.attention') as HTMLElement;
      expect(panel.textContent).toContain('Không có hồ sơ nào đang chờ');
      expect(panel.textContent).not.toContain('quá hạn');
      expect(panel.textContent).not.toContain('SLA');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Cơ cấu theo luồng và lưu lượng theo ngày (BUG-030)', () => {
    it('cơ cấu theo luồng dựng donut từ byType, nhãn loại tra qua i18n', () => {
      api.getDashboardOverview.and.returnValue(
        of(
          tongQuan({
            byType: [
              { type: 'IMPORT', count: 8 },
              { type: 'EXPORT', count: 3 },
            ],
          }),
        ),
      );
      taoTrang();

      const option = noiBo()['typeOption']() as any;
      expect(option.series[0].type).toBe('pie');
      expect(option.series[0].data.map((slice: { name: string; value: number }) => [slice.name, slice.value])).toEqual([
        ['Nhập khẩu', 8],
        ['Xuất khẩu', 3],
      ]);
      expect(noiBo()['typeTable']().rows).toEqual([
        ['Nhập khẩu', 8],
        ['Xuất khẩu', 3],
      ]);
      expect(noiBo()['typeAria']()).toContain('2 luồng, tổng 11 hồ sơ');
    });

    it('lưu lượng theo ngày dựng cột tiếp nhận + đường hoàn tất, nhãn ngày DD/MM', () => {
      api.getDashboardOverview.and.returnValue(
        of(
          tongQuan({
            daily: [
              { date: '2026-07-20', submitted: 12, completed: 5 },
              { date: '2026-07-21', submitted: 18, completed: 9 },
            ],
          }),
        ),
      );
      taoTrang();

      const option = noiBo()['dailyOption']() as any;
      expect(option.xAxis.data).toEqual(['20/07', '21/07']);
      expect(option.series[0].type).toBe('bar');
      expect(option.series[0].data).toEqual([12, 18]);
      expect(option.series[1].type).toBe('line');
      expect(option.series[1].data).toEqual([5, 9]);
      expect(noiBo()['dailyTable']().rows).toEqual([
        ['20/07', 12, 5],
        ['21/07', 18, 9],
      ]);
      expect(noiBo()['dailyAria']()).toContain('2 ngày');
    });

    it('không có byType/daily thì không dựng cấu hình (tránh canvas trắng)', () => {
      taoTrang();

      expect(noiBo()['typeOption']()).toBeNull();
      expect(noiBo()['dailyOption']()).toBeNull();
      expect(noiDungTrang()).toContain('Chưa có hồ sơ theo luồng nào');
      expect(noiDungTrang()).toContain('Chưa có lưu lượng theo ngày nào');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Xu hướng "so với hôm qua" trên thẻ KPI (Lô 5)', () => {
    it('KPI có trend thì hiện mũi tên và % so với hôm qua theo đúng chiều', () => {
      api.getDashboardOverview.and.returnValue(
        of(
          tongQuan({
            kpis: [
              chiSo({ key: 'total', label: 'Tổng hồ sơ', value: 256, trend: { today: 118, yesterday: 100, deltaPercent: 18, direction: 'up' } }),
              chiSo({ key: 'rejected', label: 'Từ chối', value: 12, trend: { today: 5, yesterday: 10, deltaPercent: -50, direction: 'down' } }),
            ],
          }),
        ),
      );
      taoTrang();

      const the = fixture.nativeElement.querySelectorAll('.kpi') as NodeListOf<HTMLElement>;
      const up = the[0].querySelector('.kpi__trend') as HTMLElement;
      expect(up.getAttribute('data-dir')).toBe('up');
      expect(up.textContent).toContain('18% so với hôm qua');
      expect(up.textContent).toContain('arrow_upward');

      const down = the[1].querySelector('.kpi__trend') as HTMLElement;
      expect(down.getAttribute('data-dir')).toBe('down');
      // Hiển thị trị tuyệt đối, chiều do màu/mũi tên thể hiện.
      expect(down.textContent).toContain('50% so với hôm qua');
      expect(down.textContent).toContain('arrow_downward');
    });

    it('hôm qua bằng 0 (deltaPercent null) thì hiện số hồ sơ hôm nay thay cho %', () => {
      api.getDashboardOverview.and.returnValue(
        of(tongQuan({ kpis: [chiSo({ key: 'total', label: 'Tổng hồ sơ', value: 7, trend: { today: 7, yesterday: 0, deltaPercent: null, direction: 'up' } })] })),
      );
      taoTrang();

      const trend = fixture.nativeElement.querySelector('.kpi__trend') as HTMLElement;
      expect(trend.textContent).toContain('7 hồ sơ hôm nay');
      expect(trend.textContent).not.toContain('%');
    });

    it('KPI không có trend thì không vẽ mũi tên nào (không bịa xu hướng)', () => {
      taoTrang();

      expect(fixture.nativeElement.querySelector('.kpi__trend')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Cảnh báo cần chú ý — Giới hạn hiển thị và thanh cuộn (SG-218)', () => {
    it('SG-218 — danh sách cảnh báo giới hạn chiều cao hiển thị tối đa 7 thông báo và có thanh cuộn', () => {
      const mockAlerts = Array.from({ length: 10 }, (_, i) => ({
        id: `alt-${i}`,
        level: 'WARN' as const,
        message: `Thông báo cảnh báo số ${i + 1}`,
        dossierId: `ds-${i}`,
        dossierCode: `IMP-20260820-${i}`,
      }));
      api.getDashboardOverview.and.returnValue(of(tongQuan({ alerts: mockAlerts })));
      taoTrang();

      const alertsList = fixture.nativeElement.querySelector('.alerts__list') as HTMLElement;
      expect(alertsList).not.toBeNull();
      const items = alertsList.querySelectorAll('li.alert');
      expect(items.length).toBe(10);
      const countEl = fixture.nativeElement.querySelector('.alerts__count') as HTMLElement;
      expect(countEl.textContent?.trim()).toBe('10');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Bảng Hồ sơ cần xử lý gấp (SG-251)', () => {
    it('SG-251 — hiển thị danh sách hồ sơ cần xử lý gấp và thông tin đơn vị/bước đang chờ', () => {
      const mockAttention = [
        {
          dossierId: 'd-1',
          dossierCode: 'EXP-20260818-000012',
          enterpriseName: 'Công ty TNHH Giải pháp ABC',
          type: 'EXPORT',
          stepLabel: 'Kiểm dịch kiểm tra nghiệp vụ theo chuyên ngành',
          waitingSince: '2026-08-18T14:23:00.000Z',
        },
        {
          dossierId: 'd-2',
          dossierCode: 'IMP-20260819-000019',
          enterpriseName: 'Doanh nghiệp B',
          type: 'IMPORT',
          stepLabel: 'Biên phòng, Hải quan, Kiểm dịch: Kiểm tra nghiệp vụ theo chuyên ngành',
          waitingSince: '2026-08-19T08:58:00.000Z',
        },
      ];
      api.getDashboardOverview.and.returnValue(of(tongQuan({ attention: mockAttention })));
      taoTrang();

      const tableRows = fixture.nativeElement.querySelectorAll('.attention__item') as NodeListOf<HTMLElement>;
      expect(tableRows.length).toBe(2);

      const firstRowCode = tableRows[0].querySelector('.attention__code') as HTMLElement;
      expect(firstRowCode.textContent?.trim()).toBe('EXP-20260818-000012');

      const firstRowStep = tableRows[0].querySelector('.attention__step') as HTMLElement;
      expect(firstRowStep.textContent?.trim()).toBe('Kiểm dịch kiểm tra nghiệp vụ theo chuyên ngành');

      const secondRowStep = tableRows[1].querySelector('.attention__step') as HTMLElement;
      expect(secondRowStep.textContent?.trim()).toBe('Biên phòng, Hải quan, Kiểm dịch: Kiểm tra nghiệp vụ theo chuyên ngành');
    });

    it('SG-251 — chuẩn hóa nhãn kiểm tra nghiệp vụ chung thành đầy đủ các lực lượng liên ngành và xử lý nhãn trống', () => {
      const mockAttention = [
        {
          dossierId: 'd-3',
          dossierCode: 'IMP-20260820-000030',
          enterpriseName: 'Doanh nghiệp C',
          type: 'IMPORT',
          stepLabel: 'Kiểm tra nghiệp vụ theo chuyên ngành',
          waitingSince: '2026-08-20T08:00:00.000Z',
        },
        {
          dossierId: 'd-4',
          dossierCode: 'EXP-20260820-000031',
          enterpriseName: 'Doanh nghiệp D',
          type: 'EXPORT',
          stepLabel: '',
          waitingSince: '2026-08-20T09:00:00.000Z',
        },
      ];
      api.getDashboardOverview.and.returnValue(of(tongQuan({ attention: mockAttention })));
      taoTrang();

      const tableRows = fixture.nativeElement.querySelectorAll('.attention__item') as NodeListOf<HTMLElement>;
      expect(tableRows.length).toBe(2);

      const firstRowStep = tableRows[0].querySelector('.attention__step') as HTMLElement;
      expect(firstRowStep.textContent?.trim()).toBe('Biên phòng, Hải quan, Kiểm dịch: Kiểm tra nghiệp vụ theo chuyên ngành');

      const secondRowStep = tableRows[1].querySelector('.attention__step') as HTMLElement;
      expect(secondRowStep.textContent?.trim()).toBe('—');
    });
  });
});
