import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccessProfile } from '../../../core/auth/access-control.model';
import { SESSION_STORAGE_KEY } from '../../../core/auth/session.storage';
import { FeeRow, FeeTransaction } from '../../../core/models/fees.model';
import { ApiService, FeeScreenConfig } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { FeeWorkbenchPageComponent } from './fee-workbench-page.component';

/**
 * UI-11 — Màn tác nghiệp thu phí theo lực lượng.
 *
 * Khóa các sửa lỗi của LÔ 3:
 *  - BUG #1: thao tác gắn theo **từng dòng** (`row`), không có nút ở header/action-strip nhắm mù vào
 *    `feeRows()[0]`. Header chỉ có nút xuất CSV.
 *  - BUG-007: nút thu tiền (COLLECT) đã bị gỡ — màn chỉ tra cứu/đối soát.
 *  - BUG-008: KPI và số tiền lấy từ trường THẬT (`amount`/`paid`/`outstanding`) do API trả.
 *  - Lọc theo loại phí / khoảng ngày / cờ OVERDUE.
 *  - BUG-028: nút xuất gọi **API máy chủ** (đọc số thật + ghi nhật ký), không tự sinh CSV ở trình duyệt.
 *  - BUG-029: thao tác điều chỉnh/bổ sung/hủy/gộp **bắt buộc lý do/ghi chú** mới submit được.
 */

const SCREEN: FeeScreenConfig = {
  slug: 'tax',
  force: 'taxFee',
  searchFields: ['PLATE_NUMBER', 'TAX_CODE'],
  actions: ['SUPPLEMENT_PAYMENT', 'CANCEL_PAYMENT'],
};

function feeRow(overrides: Partial<FeeRow> = {}): FeeRow {
  return {
    declarationId: overrides.declarationId ?? 'd-1',
    code: overrides.code ?? 'HS-1',
    plate: overrides.plate ?? '29A-00001',
    trailer: overrides.trailer ?? '',
    taxCode: overrides.taxCode ?? '0101',
    company: overrides.company ?? 'Công ty A',
    feeType: overrides.feeType ?? 'INFRASTRUCTURE',
    amount: overrides.amount ?? 100_000,
    paid: overrides.paid ?? 0,
    outstanding: overrides.outstanding ?? 100_000,
    status: overrides.status ?? 'PENDING',
    createdAt: overrides.createdAt ?? '2026-07-01T00:00:00.000Z',
    overdue: overrides.overdue ?? false,
    // Mặc định hồ sơ ĐÃ tới bước thu phí — các test thu bình thường giữ nguyên ý nghĩa.
    feeStepReached: overrides.feeStepReached ?? true,
  };
}

const ROWS: FeeRow[] = [
  feeRow({ code: 'HS-1', feeType: 'INFRASTRUCTURE', amount: 100_000, paid: 0, outstanding: 100_000, status: 'PENDING', createdAt: '2026-07-01T00:00:00.000Z', overdue: true }),
  feeRow({ code: 'HS-2', feeType: 'PARKING', amount: 200_000, paid: 200_000, outstanding: 0, status: 'COMPLETED', createdAt: '2026-07-05T00:00:00.000Z', overdue: false }),
  feeRow({ code: 'HS-3', feeType: 'INFRASTRUCTURE', amount: 300_000, paid: 0, outstanding: 300_000, status: 'PROCESSING', createdAt: '2026-07-10T00:00:00.000Z', overdue: false }),
];

function hoSo(permissions: string[]): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'thu-phi',
      displayName: 'Cán bộ thu phí',
      title: 'Thu phí',
      email: 'thuphi@chc.gov.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: null,
    },
    roles: [{ code: 'FEE_COLLECTOR', name: 'Thu phí', dataScope: 'ALL' }],
    permissions,
    assignments: [],
    menu: [],
  };
}

describe('FeeWorkbenchPageComponent — thu phí theo lực lượng (UI-11)', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<FeeWorkbenchPageComponent>;
  let component: FeeWorkbenchPageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function taoTrang(quyen: string[] = ['fee.approve', 'fee.export'], rows?: FeeRow[]): void {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token', profile: hoSo(quyen) }));
    // Chỉ ghi đè nguồn dữ liệu khi test truyền danh sách riêng — nếu không, giữ stub của beforeEach
    // (hoặc throwError mà test tự đặt trước khi gọi taoTrang) để không vô tình che mất kịch bản lỗi.
    if (rows !== undefined) {
      api.getFeeItems.and.returnValue(of(rows as unknown as Array<Record<string, unknown>>));
    }
    TestBed.configureTestingModule({
      imports: [FeeWorkbenchPageComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    fixture = TestBed.createComponent(FeeWorkbenchPageComponent);
    component = fixture.componentInstance;
    component.slug = 'tax';
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getFeeScreens',
      'getFeeItems',
      'runFeeAction',
      'exportFeeItems',
      'collectFee',
      'getDeclaration',
      'getDossierFees',
      'downloadFile',
      'getFileMetadata',
      'logExportResult',
    ]);
    api.getFeeScreens.and.returnValue(of([SCREEN]));
    api.getFeeItems.and.returnValue(of(ROWS as unknown as Array<Record<string, unknown>>));
    api.runFeeAction.and.returnValue(of({}));
    api.exportFeeItems.and.returnValue(of(new Blob(['x'], { type: 'text/csv' })));
    api.logExportResult.and.returnValue(of({ success: true }));
    api.collectFee.and.returnValue(of({ id: 'tx-1' } as unknown as FeeTransaction));
    api.getDeclaration.and.returnValue(
      of({
        id: 'd-1',
        code: 'HS-1',
        attachments: [
          { id: 'att-1', fileName: 'to-khai.pdf', sizeBytes: 2048, documentTypeCode: 'CUSTOMS_DECLARATION' },
          { id: 'att-2', fileName: 'bien-lai-goc.png', sizeBytes: 1024, documentTypeCode: 'PAYMENT_RECEIPT' },
        ],
      } as any),
    );
    api.getDossierFees.and.returnValue(
      of({
        transactions: [
          { id: 'tx-1', attachmentId: 'att-tx-1' },
        ],
      } as any),
    );
    api.getFileMetadata.and.returnValue(
      of({ id: 'att-tx-1', fileName: 'bien-lai-thu-phi.png', sizeBytes: 1024 } as any),
    );
    api.downloadFile.and.returnValue(of(new Blob(['test-content'], { type: 'application/pdf' })));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('nạp cấu hình màn và danh sách phí khi khởi tạo', () => {
    taoTrang();
    expect(api.getFeeScreens).toHaveBeenCalled();
    expect(api.getFeeItems).toHaveBeenCalled();
    expect(noiBo()['feeRows']().length).toBe(3);
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
  });

  it('cột hiển thị Mã hồ sơ và Ngày lập cho từng dòng', () => {
    taoTrang();
    const firstRow = (fixture.nativeElement as HTMLElement).querySelector('tbody tr');
    const cells = Array.from(firstRow!.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim());
    // Cột đầu là mã hồ sơ; có một ô chứa nhãn ngày (khác rỗng) ở cột "Ngày lập".
    expect(cells[0]).toBe('HS-1');
    expect(cells.some((text) => /2026|01\/07|07\/2026|7\/1\/2026/.test(text))).toBeTrue();
  });

  it('cột Mã hồ sơ có liên kết dẫn đến màn hình chi tiết hồ sơ /declarations/:id', () => {
    taoTrang();
    const firstRow = (fixture.nativeElement as HTMLElement).querySelector('tbody tr');
    const link = firstRow!.querySelector('td a.target-link') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/declarations/d-1');
    expect(link.textContent?.trim()).toBe('HS-1');
  });

  describe('KPI tiền thật', () => {
    it('tổng phải thu / đã thu / chưa thu / quá hạn tính từ danh sách', () => {
      taoTrang();
      expect(noiBo()['kpiTotalDue']()).toBe(600_000);
      expect(noiBo()['kpiPaid']()).toBe(200_000);
      expect(noiBo()['kpiUnpaid']()).toBe(400_000);
      expect(noiBo()['kpiOverdue']()).toBe(100_000);
    });

    it('BUG-057 — 2 thẻ cuối đếm SỐ PHIẾU (còn nợ / quá hạn), kèm hậu tố "phiếu"', () => {
      taoTrang();
      // HS-1 (còn nợ, quá hạn), HS-2 (đã thu hết), HS-3 (còn nợ) → chưa thanh toán 2 phiếu, quá hạn 1 phiếu.
      expect(noiBo()['kpiUnpaidCount']()).toBe(2);
      expect(noiBo()['kpiOverdueCount']()).toBe(1);

      const cards = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.stats .kpi'));
      const unpaidText = (cards[2].querySelector('.kpi__body strong') as HTMLElement).textContent ?? '';
      const overdueText = (cards[3].querySelector('.kpi__body strong') as HTMLElement).textContent ?? '';
      expect(unpaidText).toContain('2 phiếu');
      expect(overdueText).toContain('1 phiếu');
    });
  });

  describe('Lọc danh sách', () => {
    it('lọc theo loại phí chỉ giữ dòng khớp mã', () => {
      taoTrang();
      noiBo()['changeFeeTypeFilter']('PARKING');
      const filtered = noiBo()['filteredFeeRows']();
      expect(filtered.length).toBe(1);
      expect(filtered[0].code).toBe('HS-2');
    });

    it('lọc theo khoảng ngày lập và cập nhật tổng số bản ghi, phân trang đồng bộ', () => {
      taoTrang();
      expect(noiBo()['total']()).toBe(3);
      expect(noiBo()['summary']()).toBe('Hiển thị 1 đến 3 trong tổng số 3 khoản phí');

      noiBo()['dateFrom'] = '2026-07-04';
      noiBo()['dateTo'] = '2026-07-08';
      noiBo()['goToPage'](1);

      const filtered = noiBo()['filteredFeeRows']();
      expect(filtered.map((row: FeeRow) => row.code)).toEqual(['HS-2']);
      expect(noiBo()['total']()).toBe(1);
      expect(noiBo()['totalPages']()).toBe(1);
      expect(noiBo()['summary']()).toBe('Hiển thị 1 đến 1 trong tổng số 1 khoản phí');
      expect(noiBo()['pagedFeeRows']().length).toBe(1);
    });

    it('lọc OVERDUE dựa trên cờ quá hạn, không theo mã trạng thái', () => {
      taoTrang();
      noiBo()['changeStatusFilter']('OVERDUE');
      const filtered = noiBo()['filteredFeeRows']();
      expect(filtered.map((row: FeeRow) => row.code)).toEqual(['HS-1']);
    });

    it('dropdown loại phí dựng từ các mã có trong dữ liệu', () => {
      taoTrang();
      expect(noiBo()['feeTypeOptions']()).toEqual(['INFRASTRUCTURE', 'PARKING']);
    });

    it('lọc theo biển số xe (PLATE_NUMBER) chứa khoảng trắng chính xác', () => {
      const customRows = [
        feeRow({ code: 'HS-1', plate: '29-X5 8888' }),
        feeRow({ code: 'HS-2', plate: '29-X5 9999' }),
      ];
      taoTrang(['fee.approve'], customRows);
      noiBo()['updateFeeFilter']('PLATE_NUMBER', '29-x5 8');
      const filtered = noiBo()['filteredFeeRows']();
      expect(filtered.length).toBe(1);
      expect(filtered[0].plate).toBe('29-X5 8888');
    });

    it('nút Tìm kiếm và Đặt lại được thiết kế chuẩn theo Design System', () => {
      taoTrang();
      const filterActions = (fixture.nativeElement as HTMLElement).querySelector('.filter-panel .filter-actions');
      expect(filterActions).toBeTruthy();

      const buttons = filterActions!.querySelectorAll('button');
      expect(buttons.length).toBe(2);

      const searchBtn = buttons[0];
      expect(searchBtn.classList.contains('sg-btn')).toBeTrue();
      expect(searchBtn.classList.contains('sg-btn--primary')).toBeTrue();
      expect(searchBtn.textContent).toContain('Tìm kiếm');
      expect(searchBtn.querySelector('mat-icon')!.textContent).toContain('search');

      const resetBtn = buttons[1];
      expect(resetBtn.classList.contains('sg-btn')).toBeTrue();
      expect(resetBtn.classList.contains('sg-btn--tertiary')).toBeTrue();
      expect(resetBtn.textContent).toContain('Đặt lại');
      expect(resetBtn.querySelector('mat-icon')!.textContent).toContain('restart_alt');
    });

    it('đặt lại bộ lọc thì xóa sạch tiêu chí và tải lại danh sách từ trang 1', () => {
      taoTrang();
      noiBo()['feeFilters']['PLATE_NUMBER'] = '29A';
      noiBo()['statusFilter'].set('PAID');
      noiBo()['feeTypeFilter'].set('PARKING');
      noiBo()['dateFrom'] = '2026-07-01';
      noiBo()['dateTo'] = '2026-07-31';
      noiBo()['page'].set(3);

      const countBefore = api.getFeeItems.calls.count();
      noiBo()['resetFilters']();

      expect(noiBo()['feeFilters']).toEqual({});
      expect(noiBo()['statusFilter']()).toBe('ALL');
      expect(noiBo()['feeTypeFilter']()).toBe('');
      expect(noiBo()['dateFrom']).toBe('');
      expect(noiBo()['dateTo']).toBe('');
      expect(noiBo()['page']()).toBe(1);
      expect(api.getFeeItems.calls.count()).toBe(countBefore + 1);
    });
  });

  describe('BUG #1 — thao tác gắn theo dòng, không nhắm feeRows()[0]', () => {
    it('header chỉ có nút xuất CSV, không có nút thao tác phí', () => {
      taoTrang();
      const header = (fixture.nativeElement as HTMLElement).querySelector('.page-header');
      const buttons = header!.querySelectorAll('button');
      expect(buttons.length).toBe(1); // duy nhất nút export
    });

    it('mở modal thao tác từ dòng cụ thể giữ đúng row đó (không phải dòng đầu)', () => {
      taoTrang();
      noiBo()['openFeeModal']('SUPPLEMENT_PAYMENT', ROWS[2]);
      expect(noiBo()['feeModal']().row.code).toBe('HS-3');
    });
  });

  describe('BUG-007 — gỡ nút thu tiền (COLLECT) khỏi màn đối soát', () => {
    it('không còn nút thu tiền (.payment) ở bất kỳ dòng nào', () => {
      taoTrang();
      const collectButtons = (fixture.nativeElement as HTMLElement).querySelectorAll(
        'tbody tr td.actions .payment',
      );
      expect(collectButtons.length).toBe(0);
    });

    it('không còn nút tác vụ điều chỉnh trên danh sách dòng phí', () => {
      taoTrang();
      const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'));
      rows.forEach((row) => {
        const buttons = row.querySelectorAll('td.actions button');
        expect(Array.from(buttons).some((b) => b.getAttribute('title') === 'Điều chỉnh')).toBeFalse();
      });
    });

    it('BUG-029 — chưa nhập lý do thì chưa submit được; nhập rồi mới bật', () => {
      taoTrang();
      noiBo()['openFeeModal']('SUPPLEMENT_PAYMENT', ROWS[0]);
      const modal = noiBo()['feeModal']();
      expect(noiBo()['canSubmit'](modal)).toBeFalse(); // ô lý do rỗng
      noiBo()['feeNote'] = 'Bổ sung do đổi xe';
      expect(noiBo()['canSubmit'](modal)).toBeTrue();
    });

    it('gửi thao tác bổ sung rồi tải lại danh sách, KHÔNG kèm method', () => {
      taoTrang();
      const soLan = api.getFeeItems.calls.count();
      noiBo()['openFeeModal']('SUPPLEMENT_PAYMENT', ROWS[0]);
      noiBo()['submitFeeAction']();

      expect(api.runFeeAction).toHaveBeenCalled();
      const [slug, action, payload] = api.runFeeAction.calls.mostRecent().args;
      expect(slug).toBe('tax');
      expect(action).toBe('SUPPLEMENT_PAYMENT');
      expect((payload as { method?: string }).method).toBeUndefined();
      expect(api.getFeeItems.calls.count()).toBe(soLan + 1);
    });
  });

  describe('Quyền thao tác', () => {
    it('không có quyền fee.approve thì canRunFeeAction=false và mở modal thao tác bị chặn', () => {
      taoTrang([]);
      expect(noiBo()['canRunFeeAction']()).toBeFalse();
      noiBo()['openFeeModal']('SUPPLEMENT_PAYMENT', ROWS[0]);
      // Bị chặn: không mở modal, có thông báo qua toast.
      expect(noiBo()['feeModal']()).toBeNull();
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.tone === 'error')).toBe(true);
    });

    it('mở chi tiết không cần quyền', () => {
      taoTrang([]);
      noiBo()['openDetail'](ROWS[0]);
      expect(noiBo()['feeModal']().mode).toBe('detail');
    });

    it('chỉ có quyền fee.view thì nút xuất file không hiển thị và gọi exportCsv bị chặn', () => {
      taoTrang(['fee.view']);
      const header = (fixture.nativeElement as HTMLElement).querySelector('.page-header');
      const exportButton = header!.querySelector('button');
      expect(exportButton).toBeNull();

      noiBo()['exportCsv']();
      expect(api.exportFeeItems).not.toHaveBeenCalled();
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.tone === 'error')).toBe(true);
    });

    it('có quyền fee.export thì nút xuất file hiển thị trên header', () => {
      taoTrang(['fee.view', 'fee.export']);
      const header = (fixture.nativeElement as HTMLElement).querySelector('.page-header');
      const exportButton = header!.querySelector('button');
      expect(exportButton).not.toBeNull();
    });
  });

  describe('Xuất đối soát phí (server-side) và in biên lai', () => {
    it('BUG-028 — có dữ liệu thì gọi API xuất ở máy chủ rồi tải blob', async () => {
      const originalShowPicker = (window as unknown as Record<string, unknown>)['showSaveFilePicker'];
      delete (window as unknown as Record<string, unknown>)['showSaveFilePicker'];
      try {
        taoTrang();
        spyOn(URL, 'createObjectURL').and.returnValue('blob:x');
        spyOn(URL, 'revokeObjectURL');
        const anchor = document.createElement('a');
        spyOn(anchor, 'click');
        spyOn(document, 'createElement').and.returnValue(anchor);

        noiBo()['exportCsv']();
        await fixture.whenStable();

        expect(api.exportFeeItems).toHaveBeenCalled();
        expect(api.exportFeeItems.calls.mostRecent().args[0]).toBe('tax');
        expect(anchor.click).toHaveBeenCalled();
      } finally {
        if (originalShowPicker !== undefined) {
          (window as unknown as Record<string, unknown>)['showSaveFilePicker'] = originalShowPicker;
        } else {
          delete (window as unknown as Record<string, unknown>)['showSaveFilePicker'];
        }
      }
    });

    it('BUG-028 — gửi đúng bộ lọc đang xem xuống API (trạng thái/loại phí/khoảng ngày)', () => {
      taoTrang();
      noiBo()['changeStatusFilter']('OVERDUE');
      noiBo()['changeFeeTypeFilter']('INFRASTRUCTURE');
      noiBo()['dateFrom'] = '2026-07-01';
      noiBo()['dateTo'] = '2026-07-31';
      spyOn(URL, 'createObjectURL').and.returnValue('blob:x');
      spyOn(URL, 'revokeObjectURL');
      const anchor = document.createElement('a');
      spyOn(anchor, 'click');
      spyOn(document, 'createElement').and.returnValue(anchor);

      noiBo()['exportCsv']();

      const query = api.exportFeeItems.calls.mostRecent().args[1] as Record<string, unknown>;
      expect(query).toEqual(
        jasmine.objectContaining({ status: 'OVERDUE', feeType: 'INFRASTRUCTURE', from: '2026-07-01', to: '2026-07-31' }),
      );
    });

    it('BUG-028 — không có dòng nào thì báo trống, không gọi API', () => {
      taoTrang(['fee.approve', 'fee.export'], []);
      noiBo()['exportCsv']();
      expect(api.exportFeeItems).not.toHaveBeenCalled();
      expect(TestBed.inject(AppMessageService).messages().length).toBeGreaterThan(0);
    });

    it('SG-225 — khi người dùng hủy Save As, thông báo hủy và gọi logExportResult báo về máy chủ', async () => {
      taoTrang();
      const abortErr = new Error('The user aborted a request.');
      abortErr.name = 'AbortError';
      (window as unknown as Record<string, unknown>)['showSaveFilePicker'] = jasmine.createSpy('showSaveFilePicker').and.rejectWith(abortErr);

      noiBo()['exportCsv']();
      await fixture.whenStable();

      expect(api.logExportResult).toHaveBeenCalledWith(
        jasmine.objectContaining({
          action: 'REPORT_EXPORT',
          targetType: 'FEE_WORKBENCH',
          result: 'CANCELLED',
        }),
      );
      delete (window as unknown as Record<string, unknown>)['showSaveFilePicker'];
    });

    it('in biên lai mở cửa sổ in của trình duyệt', () => {
      taoTrang();
      const win = jasmine.createSpyObj('win', ['focus', 'print']);
      win.document = jasmine.createSpyObj('doc', ['write', 'close']);
      spyOn(window, 'open').and.returnValue(win as unknown as Window);

      noiBo()['printReceipt'](ROWS[1]);

      expect(window.open).toHaveBeenCalled();
      expect(win.print).toHaveBeenCalled();
    });
  });

  describe('BUG-007 đảo lại — thu phí THẬT ngay trên bàn làm việc (thu một nhịp)', () => {
    it('có quyền + còn phải thu > 0 thì hiện nút thu phí trên dòng; ẩn khi outstanding = 0', () => {
      taoTrang(['fee.approve']);
      const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'));
      // HS-1 (còn nợ) và HS-3 (còn nợ) có nút .collect; HS-2 (đã thu hết) không có.
      expect(rows[0].querySelector('td.actions .collect')).not.toBeNull();
      expect(rows[1].querySelector('td.actions .collect')).toBeNull();
      expect(rows[2].querySelector('td.actions .collect')).not.toBeNull();
    });

    it('không có quyền fee.approve thì không hiện nút thu phí ở bất kỳ dòng nào', () => {
      taoTrang([]);
      const collectButtons = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr td.actions .collect');
      expect(collectButtons.length).toBe(0);
    });

    it('nút thu phí là liên kết trỏ tới màn hình thu phí theo hồ sơ /declarations/:id/fees', () => {
      taoTrang(['fee.approve']);
      const collectLink = (fixture.nativeElement as HTMLElement).querySelector('tbody tr td.actions a.collect') as HTMLAnchorElement;
      expect(collectLink).not.toBeNull();
      expect(collectLink.getAttribute('href')).toBe('/declarations/d-1/fees');
    });
  });

  describe('Quyết định chủ dự án — chỉ thu khi hồ sơ đã tới bước thu phí', () => {
    const chuaToiBuoc = [
      feeRow({ code: 'HS-9', declarationId: 'd-9', amount: 100_000, paid: 0, outstanding: 100_000, status: 'PENDING', feeStepReached: false }),
    ];

    it('còn nợ nhưng CHƯA tới bước phí → ẩn nút thu, hiện gợi ý ngắn', () => {
      taoTrang(['fee.approve'], chuaToiBuoc);
      const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr');
      expect(row!.querySelector('td.actions .collect')).toBeNull();
      expect(row!.querySelector('td.actions .step-hint')).not.toBeNull();
    });

    it('đã tới bước phí → hiện nút thu như thường', () => {
      taoTrang(['fee.approve'], [feeRow({ code: 'HS-10', declarationId: 'd-10', outstanding: 100_000, feeStepReached: true })]);
      const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr');
      expect(row!.querySelector('td.actions .collect')).not.toBeNull();
      expect(row!.querySelector('td.actions .step-hint')).toBeNull();
    });

    it('canCollectRow trả về false khi hồ sơ chưa tới bước phí', () => {
      expect(noiBo()['canCollectRow'](chuaToiBuoc[0])).toBe(false);
    });
  });

  describe('Phân trang đồng bộ sg-pager', () => {
    it('hiển thị sg-pager và vùng điều khiển phân trang chuẩn', () => {
      taoTrang();
      const pager = (fixture.nativeElement as HTMLElement).querySelector('sg-pager');
      expect(pager).not.toBeNull();

      const footer = (fixture.nativeElement as HTMLElement).querySelector('.pager');
      expect(footer).not.toBeNull();
      expect(footer!.querySelector('.pager__controls')).not.toBeNull();
      expect(footer!.textContent).toContain('khoản phí');
    });

    it('chuyển trang cập nhật page signal và danh sách hiển thị', () => {
      // Tạo 15 dòng dữ liệu
      const manyRows = Array.from({ length: 15 }, (_, i) =>
        feeRow({ code: `HS-${i + 1}`, amount: 100_000, paid: 0, outstanding: 100_000 }),
      );
      taoTrang(['fee.approve'], manyRows);
      expect(noiBo()['totalPages']()).toBe(2);
      expect(noiBo()['pagedFeeRows']().length).toBe(10);
      expect(noiBo()['pagedFeeRows']()[0].code).toBe('HS-1');

      noiBo()['goToPage'](2);
      expect(noiBo()['page']()).toBe(2);
      expect(noiBo()['pagedFeeRows']().length).toBe(5);
      expect(noiBo()['pagedFeeRows']()[0].code).toBe('HS-11');
    });

    it('đổi kích thước trang đưa về trang 1 và cập nhật pageSize', () => {
      const manyRows = Array.from({ length: 25 }, (_, i) =>
        feeRow({ code: `HS-${i + 1}` }),
      );
      taoTrang(['fee.approve'], manyRows);
      noiBo()['goToPage'](2);
      expect(noiBo()['page']()).toBe(2);

      noiBo()['changePageSize']('20');
      expect(noiBo()['pageSize']()).toBe(20);
      expect(noiBo()['page']()).toBe(1);
      expect(noiBo()['pagedFeeRows']().length).toBe(20);
    });

    it('hiển thị summary đúng khi rỗng', () => {
      taoTrang(['fee.approve'], []);
      expect(noiBo()['summary']()).toContain('0');
    });

    it('hiển thị summary đúng khi có dữ liệu', () => {
      taoTrang(['fee.approve'], ROWS);
      expect(noiBo()['summary']()).toBe('Hiển thị 1 đến 3 trong tổng số 3 khoản phí');
    });
  });

  it('lỗi tải danh sách thì hiện lỗi trong bảng', () => {
    api.getFeeItems.and.returnValue(throwError(() => new Error('loi')));
    taoTrang();
    expect(noiBo()['error']()).toBeTruthy();
    expect(noiBo()['feeRows']().length).toBe(0);
  });

  describe('Xem chi tiết và tải chứng từ đính kèm trong modal', () => {
    it('mở modal chi tiết chỉ nạp các tệp liên quan đến phí (PAYMENT_RECEIPT & biên lai giao dịch) và tải tệp khi click', async () => {
      taoTrang();
      const firstRow = ROWS[0];
      noiBo()['openDetail'](firstRow);
      fixture.detectChanges();

      expect(api.getDeclaration).toHaveBeenCalledWith('d-1');
      expect(api.getDossierFees).toHaveBeenCalledWith('d-1');
      expect(api.getFileMetadata).toHaveBeenCalledWith('att-tx-1');

      const attachments = noiBo()['detailAttachments']();
      // Chỉ 2 file liên quan đến phí, file to-khai.pdf (CUSTOMS_DECLARATION) bị lọc bỏ
      expect(attachments.length).toBe(2);
      expect(attachments[0].fileName).toBe('bien-lai-goc.png');
      expect(attachments[1].fileName).toBe('bien-lai-thu-phi.png');

      const anchorGia = document.createElement('a');
      spyOn(anchorGia, 'click');
      const origCreate = document.createElement.bind(document);
      spyOn(document, 'createElement').and.callFake((tagName: string) => {
        if (tagName === 'a') return anchorGia;
        return origCreate(tagName);
      });
      spyOn(URL, 'createObjectURL').and.returnValue('blob:fake');
      spyOn(URL, 'revokeObjectURL');

      noiBo()['downloadAttachment'](attachments[0]);
      await fixture.whenStable();
      expect(api.downloadFile).toHaveBeenCalledWith('att-2');
      expect(anchorGia.download).toBe('bien-lai-goc.png');
      expect(anchorGia.click).toHaveBeenCalled();
    });

    it('nếu hồ sơ không có tệp nào thì danh sách tệp rỗng và hiển thị dấu gạch ngang', () => {
      api.getDeclaration.and.returnValue(of({ id: 'd-1', code: 'HS-1', attachments: [] } as any));
      api.getDossierFees.and.returnValue(of({ transactions: [] } as any));
      taoTrang();

      noiBo()['openDetail'](ROWS[0]);
      fixture.detectChanges();

      expect(noiBo()['detailAttachments']().length).toBe(0);
    });

    it('SG-291 — popup chi tiết tờ khai chưa thanh toán chỉ hiển thị nút Đóng, không hiển thị nút Điều chỉnh', () => {
      api.getDossierFees.and.returnValue(of({ transactions: [] } as any));
      // User có quyền fee.approve và bản ghi ROWS[0] chưa thanh toán (PENDING)
      taoTrang(['fee.approve']);
      noiBo()['openDetail'](ROWS[0]);
      fixture.detectChanges();

      const modal = (fixture.nativeElement as HTMLElement).querySelector('sg-modal');
      expect(modal).not.toBeNull();

      const footerButtons = Array.from(modal!.querySelectorAll<HTMLButtonElement>('.sg-modal__foot button'));
      // Chỉ có 1 nút duy nhất là Đóng
      expect(footerButtons.length).toBe(1);
      expect(footerButtons[0].textContent?.trim()).toContain('Đóng');

      // Không hiển thị nút Điều chỉnh
      const hasAdjustBtn = footerButtons.some((btn) => btn.textContent?.includes('Điều chỉnh'));
      expect(hasAdjustBtn).toBeFalse();
    });

    it('SG-292 — popup chi tiết tờ khai đã thanh toán hiển thị nút Lịch sử thanh toán và mở bảng giao dịch thanh toán khi nhấn', async () => {
      api.getDossierFees.and.returnValue(
        of({
          transactions: [
            {
              id: 'tx-paid-1',
              amount: 200_000,
              method: 'TRANSFER',
              referenceCode: 'TX-REF-888',
              status: 'CONFIRMED',
              confirmedByName: 'Cán bộ A',
              confirmedAt: '2026-07-05T10:30:00.000Z',
              attachmentId: 'att-receipt-1',
            },
          ],
        } as any),
      );
      taoTrang(['fee.approve']);

      // ROWS[1] là bản ghi đã thanh toán (COMPLETED / outstanding=0)
      noiBo()['openDetail'](ROWS[1]);
      fixture.detectChanges();

      const modal = (fixture.nativeElement as HTMLElement).querySelector('sg-modal');
      expect(modal).not.toBeNull();

      // Kiểm tra footer có nút "Lịch sử thanh toán" và "Đóng"
      const footerButtons = Array.from(modal!.querySelectorAll<HTMLButtonElement>('.sg-modal__foot button'));
      expect(footerButtons.length).toBe(2);
      const historyBtn = footerButtons.find((btn) => btn.textContent?.includes('Lịch sử thanh toán'));
      expect(historyBtn).toBeDefined();

      // Nhấn nút "Lịch sử thanh toán"
      historyBtn?.click();
      fixture.detectChanges();

      // Modal chuyển sang chế độ history
      expect(noiBo()['feeModal']().mode).toBe('history');
      expect(noiBo()['detailTransactions']().length).toBe(1);

      const historyTable = (fixture.nativeElement as HTMLElement).querySelector('.tx-table');
      expect(historyTable).not.toBeNull();
      expect(historyTable!.textContent).toContain('TX-REF-888');
      expect(historyTable!.textContent).toContain('Chuyển khoản');
      expect(historyTable!.textContent).toContain('Cán bộ A');

      // Nút tải chứng từ trong bảng giao dịch
      const downloadBtn = historyTable!.querySelector('.doc-btn') as HTMLButtonElement;
      expect(downloadBtn).not.toBeNull();
      downloadBtn.click();
      expect(api.downloadFile).toHaveBeenCalledWith('att-receipt-1');

      // Nút "Quay lại" trong footer của modal lịch sử
      const historyFooterButtons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.sg-modal__foot button'));
      const backBtn = historyFooterButtons.find((btn) => btn.textContent?.includes('Quay lại'));
      expect(backBtn).toBeDefined();

      // Nhấn "Quay lại" quay về popup chi tiết
      backBtn?.click();
      fixture.detectChanges();
      expect(noiBo()['feeModal']().mode).toBe('detail');
    });

    it('SG-295 — popup chi tiết tờ khai đã thanh toán một phần (paid > 0 & outstanding > 0) hiển thị nút Lịch sử thanh toán và mở bảng giao dịch thanh toán khi nhấn', async () => {
      const partialFeeRow = feeRow({
        code: 'TK-PARTIAL-001',
        declarationId: 'decl-partial-1',
        amount: 500_000,
        paid: 200_000,
        outstanding: 300_000,
        status: 'PENDING',
      });

      api.getDossierFees.and.returnValue(
        of({
          transactions: [
            {
              id: 'tx-partial-1',
              amount: 200_000,
              method: 'CASH',
              referenceCode: 'TX-CASH-123',
              status: 'CONFIRMED',
              confirmedByName: 'Thủ quỹ B',
              confirmedAt: '2026-07-06T09:15:00.000Z',
              attachmentId: 'att-receipt-partial-1',
            },
          ],
        } as any),
      );
      taoTrang(['fee.approve']);

      noiBo()['openDetail'](partialFeeRow);
      fixture.detectChanges();

      const modal = (fixture.nativeElement as HTMLElement).querySelector('sg-modal');
      expect(modal).not.toBeNull();

      // Kiểm tra footer có nút "Lịch sử thanh toán" và "Đóng"
      const footerButtons = Array.from(modal!.querySelectorAll<HTMLButtonElement>('.sg-modal__foot button'));
      expect(footerButtons.length).toBe(2);
      const historyBtn = footerButtons.find((btn) => btn.textContent?.includes('Lịch sử thanh toán'));
      expect(historyBtn).toBeDefined();

      // Nhấn nút "Lịch sử thanh toán"
      historyBtn?.click();
      fixture.detectChanges();

      // Modal chuyển sang chế độ history
      expect(noiBo()['feeModal']().mode).toBe('history');
      expect(noiBo()['detailTransactions']().length).toBe(1);

      const historyTable = (fixture.nativeElement as HTMLElement).querySelector('.tx-table');
      expect(historyTable).not.toBeNull();
      expect(historyTable!.textContent).toContain('TX-CASH-123');
      expect(historyTable!.textContent).toContain('Tiền mặt');
      expect(historyTable!.textContent).toContain('Thủ quỹ B');
    });
  });
});
