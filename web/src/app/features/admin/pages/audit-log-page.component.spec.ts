import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AUDIT_ACTION_CODES, AUDIT_MODULE_CODES, AuditLogRow, Paginated } from '../../../core/models/admin.model';
import { I18nService } from '../../../core/i18n/i18n.service';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { AuditLogPageComponent } from './audit-log-page.component';

/**
 * F05 Nhật ký hệ thống.
 *
 * Bộ test khóa đúng tiêu chí SRS: tra được **ai làm gì, lúc nào, từ ĐỊA CHỈ IP nào, trên đối tượng
 * nào và KẾT QUẢ ra sao**, kèm giá trị **trước/sau**. Ngoài ra: đổi bộ lọc nạp lại từ trang 1,
 * phân trang server-side, trạng thái rỗng và lỗi tải.
 */

function dong(mau: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: 'log-1',
    at: '2026-07-22T03:15:00.000Z',
    actorId: 'u-1',
    actorUsername: 'nvcong',
    actorRole: 'HAI_QUAN_B1',
    ip: '10.20.30.40',
    correlationId: 'corr-1',
    action: 'DECLARATION_SUBMIT',
    targetType: 'Declaration',
    targetId: 'HS-250519-0015',
    result: 'SUCCESS',
    before: null,
    after: { status: 'SUBMITTED' },
    ...mau,
  };
}

function trang(items: AuditLogRow[] = [dong()], total = items.length): Paginated<AuditLogRow> {
  return { items, total, page: 1, pageSize: 20 };
}

/** Nhãn của tùy chọn có `value` cho trước trong danh sách options. */
function nhanOption(options: { value: string; label: string }[], value: string): string {
  return options.find((option) => option.value === value)!.label;
}

describe('AuditLogPageComponent — nhật ký hệ thống (F05)', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<AuditLogPageComponent>;
  let component: AuditLogPageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function taoTrang(): void {
    TestBed.configureTestingModule({
      imports: [AuditLogPageComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    fixture = TestBed.createComponent(AuditLogPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function noiDung(): string {
    return (fixture.nativeElement as HTMLElement).textContent || '';
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['getAuditLogs', 'exportAuditLogs', 'logExportResult']);
    api.getAuditLogs.and.returnValue(of(trang()));
    api.exportAuditLogs.and.returnValue(of(new Blob(['x'], { type: 'text/csv' })));
    api.logExportResult.and.returnValue(of({ success: true }));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    delete (window as unknown as Record<string, unknown>)['showSaveFilePicker'];
  });

  // ---------------------------------------------------------------------------
  describe('Nạp và hiển thị', () => {
    it('nạp nhật ký khi mở trang và hiện đủ IP, kết quả, người thao tác, đối tượng thân thiện', () => {
      taoTrang();

      expect(api.getAuditLogs).toHaveBeenCalledTimes(1);
      const text = noiDung();
      expect(text).toContain('nvcong');
      expect(text).toContain('HAI_QUAN_B1');
      expect(text).toContain('10.20.30.40'); // ĐỊA CHỈ IP — SRS bắt buộc
      expect(text).toContain('Hồ sơ HS-250519-0015'); // Tên đối tượng thân thiện (SG-142)
      expect(text).toContain('Thành công'); // KẾT QUẢ — SRS bắt buộc
    });

    it('thao tác có bản dịch thì hiện nhãn tiếng Việt, không hiện mã trần', () => {
      taoTrang();
      expect(noiDung()).toContain('Gửi hồ sơ');
      expect(noiDung()).not.toContain('DECLARATION_SUBMIT');
    });

    it('các mã BE thật (khóa/danh mục/phí/gọi xe/phiên) hiện nhãn tiếng Việt, không hiện mã thô', () => {
      api.getAuditLogs.and.returnValue(
        of(trang([
          dong({ action: 'USER_LOCK', targetType: 'USER', targetId: 'u-9' }),
          dong({ action: 'DISPATCH_CALL_NEXT', targetType: 'DECLARATION', targetId: 'HS-1' }),
          dong({ action: 'AUTH_REFRESH', targetType: 'USER', targetId: 'u-10' }),
        ])),
      );
      taoTrang();

      const i18n = TestBed.inject(I18nService);
      expect(i18n.t('ui.audit.CATALOG_ITEM_UPDATE')).toBe('Cập nhật mục danh mục');
      expect(i18n.t('ui.audit.USER_LOCK')).toBe('Khóa tài khoản');
      expect(i18n.t('ui.audit.FEE_RULE_CREATE')).toBe('Tạo biểu phí');
      expect(i18n.t('ui.audit.DISPATCH_CALL_NEXT')).toBe('Gọi xe');
      expect(i18n.t('ui.audit.AUTH_REFRESH')).toBe('Làm mới phiên đăng nhập');

      expect(noiDung()).toContain('Khóa tài khoản');
      expect(noiDung()).toContain('Gọi xe');
      expect(noiDung()).toContain('Làm mới phiên đăng nhập');
      expect(noiDung()).not.toContain('DISPATCH_CALL_NEXT');
      expect(noiDung()).not.toContain('AUTH_REFRESH');

      // Tùy chọn trong bộ lọc
      const options = noiBo()['actionOptions']();
      const callOption = options.find((opt: any) => opt.value === 'DISPATCH_CALL_NEXT');
      expect(callOption).toBeTruthy();
      expect(callOption.label).toBe('Gọi xe');
      const refreshOption = options.find((opt: any) => opt.value === 'AUTH_REFRESH');
      expect(refreshOption).toBeTruthy();
      expect(refreshOption.label).toBe('Làm mới phiên đăng nhập');
    });

    it('người thao tác null thì hiển thị nhãn Hệ thống thay cho ô trống', () => {
      api.getAuditLogs.and.returnValue(of(trang([dong({ actorUsername: null, actorId: null })])));
      taoTrang();
      expect(noiDung()).toContain('Hệ thống');
    });

    it('kết quả thất bại hiển thị đúng nhãn và tông màu', () => {
      api.getAuditLogs.and.returnValue(of(trang([dong({ result: 'FAILURE' })])));
      taoTrang();

      expect(noiBo()['resultTone'](dong({ result: 'FAILURE' }))).toBe('rejected');
      expect(noiDung()).toContain('Thất bại');
    });

    it('kết quả CANCELLED (hủy thao tác xuất file SG-225) hiển thị Thất bại và tông màu rejected', () => {
      api.getAuditLogs.and.returnValue(of(trang([dong({ result: 'CANCELLED' })])));
      taoTrang();

      expect(noiBo()['resultTone'](dong({ result: 'CANCELLED' }))).toBe('rejected');
      expect(noiBo()['resultLabel'](dong({ result: 'CANCELLED' }))).toBe('Thất bại');
      expect(noiDung()).toContain('Thất bại');
    });

    it('không có dòng nào thì hiện trạng thái rỗng', () => {
      api.getAuditLogs.and.returnValue(of(trang([], 0)));
      taoTrang();
      expect(noiDung()).toContain('Không có nhật ký khớp điều kiện lọc.');
    });

    it('lỗi tải thì hiện thông báo lỗi, không giữ dòng cũ', () => {
      api.getAuditLogs.and.returnValue(throwError(() => ({ status: 500, error: {} })));
      taoTrang();

      expect(noiBo()['rows']().length).toBe(0);
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.tone === 'error' && m.text.includes('Không tải được nhật ký'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Bộ lọc — đổi lọc nạp lại từ trang 1', () => {
    it('áp dụng bộ lọc thì gửi tham số đã cắt khoảng trắng và về trang 1', () => {
      taoTrang();
      noiBo()['page'].set(3); // giả lập đang ở trang 3

      noiBo()['form'] = { actor: '  nvcong  ', action: 'DECLARATION_SUBMIT', target: 'HS-1', from: '2026-07-01', to: '2026-07-31' };
      noiBo()['applyFilters']();

      expect(noiBo()['page']()).toBe(1);
      expect(api.getAuditLogs).toHaveBeenCalledWith(
        jasmine.objectContaining({
          actor: 'nvcong',
          action: 'DECLARATION_SUBMIT',
          target: 'HS-1',
          from: '2026-07-01',
          to: '2026-07-31',
          page: 1,
          pageSize: 10,
        }),
      );
    });

    it('đặt lại bộ lọc thì xóa ô lọc và nạp lại từ trang 1 không kèm tham số lọc', () => {
      taoTrang();
      noiBo()['form'] = { actor: 'nvcong', action: '', target: '', from: '', to: '' };
      noiBo()['applyFilters']();
      api.getAuditLogs.calls.reset();

      noiBo()['resetFilters']();

      expect(noiBo()['form'].actor).toBe('');
      const params = api.getAuditLogs.calls.mostRecent().args[0]!;
      expect(params.actor).toBeUndefined();
      expect(params.page).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Phân trang', () => {
    it('hiện thanh phân trang khi tổng số lớn hơn một trang', () => {
      api.getAuditLogs.and.returnValue(of(trang([dong()], 45)));
      taoTrang();
      expect(fixture.nativeElement.querySelector('sg-pager')).not.toBeNull();
    });

    it('chuyển trang thì nạp lại với số trang mới', () => {
      api.getAuditLogs.and.returnValue(of(trang([dong()], 45)));
      taoTrang();
      api.getAuditLogs.calls.reset();

      noiBo()['goToPage'](2);

      expect(noiBo()['page']()).toBe(2);
      expect(api.getAuditLogs).toHaveBeenCalledWith(jasmine.objectContaining({ page: 2, pageSize: 10 }));
    });

    it('không nạp lại nếu chọn đúng trang hiện tại', () => {
      taoTrang();
      api.getAuditLogs.calls.reset();

      noiBo()['goToPage'](1);

      expect(api.getAuditLogs).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Ô lọc Hành động — dropdown mã đóng', () => {
    it('actionOptions KHÔNG tự thêm mục rỗng (sg-select lo placeholder), đúng đủ tập AUDIT_ACTION_CODES (BUG-050)', () => {
      taoTrang();
      const options = noiBo()['actionOptions']() as { value: string; label: string }[];

      // Đúng số mã trong tập đóng — không dư mục rỗng thứ hai (mục "Tất cả" do sg-select tự render).
      expect(options.length).toBe(AUDIT_ACTION_CODES.length);
      expect(options.some((option) => option.value === '')).toBe(false);
      expect(options.map((option) => option.value)).toEqual([...AUDIT_ACTION_CODES]);
    });

    it('nhãn tùy chọn đổi theo ngôn ngữ (computed đọc signal locale)', () => {
      taoTrang();
      const i18n = TestBed.inject(I18nService);

      let options = noiBo()['actionOptions']() as { value: string; label: string }[];
      expect(nhanOption(options, 'DECLARATION_SUBMIT')).toBe('Gửi hồ sơ');
      expect(nhanOption(options, 'CATALOG_ITEM_LOCK')).toBe('Khóa mục danh mục');

      i18n.setLocale('en');
      options = noiBo()['actionOptions']() as { value: string; label: string }[];
      expect(nhanOption(options, 'DECLARATION_SUBMIT')).toBe('Dossier submitted');

      i18n.setLocale('vi'); // trả lại mặc định để không rò sang test khác
    });

    it('chọn một mã qua ngModel form.action thì áp đúng vào bộ lọc khi lọc', () => {
      taoTrang();
      api.getAuditLogs.calls.reset();

      // Người dùng chọn "Gửi hồ sơ" trên sg-combobox — control gán mã vào form.action.
      noiBo()['form'].action = 'DECLARATION_SUBMIT';
      noiBo()['applyFilters']();

      expect(api.getAuditLogs).toHaveBeenCalledWith(jasmine.objectContaining({ action: 'DECLARATION_SUBMIT', page: 1 }));
    });

    it('gõ từ khóa và bấm Enter (onActionQuerySubmit) với nhiều mã khớp thì gửi tham số actions', () => {
      taoTrang();
      api.getAuditLogs.calls.reset();

      const deleteActions = ['DECLARATION_DELETE', 'ATTACHMENT_DELETE', 'USER_DELETE', 'ROLE_DELETE'];
      noiBo()['onActionQuerySubmit']({
        query: 'xóa',
        matchedOptions: deleteActions.map((code) => ({ value: code, label: code })),
        matchedValues: deleteActions,
      });

      expect(api.getAuditLogs).toHaveBeenCalledWith(
        jasmine.objectContaining({
          actions: deleteActions,
          page: 1,
        }),
      );
    });

    it('gõ từ khóa và bấm Enter khi chỉ khớp 1 mã thì gửi tham số action cụ thể', () => {
      taoTrang();
      api.getAuditLogs.calls.reset();

      noiBo()['onActionQuerySubmit']({
        query: 'tải lên tệp',
        matchedOptions: [{ value: 'ATTACHMENT_UPLOAD', label: 'Tải lên tệp đính kèm' }],
        matchedValues: ['ATTACHMENT_UPLOAD'],
      });

      expect(api.getAuditLogs).toHaveBeenCalledWith(
        jasmine.objectContaining({
          action: 'ATTACHMENT_UPLOAD',
          page: 1,
        }),
      );
    });

    it('để mục rỗng thì không gửi tham số action', () => {
      taoTrang();
      api.getAuditLogs.calls.reset();

      noiBo()['form'].action = '';
      noiBo()['form'].actions = [];
      noiBo()['applyFilters']();

      const params = api.getAuditLogs.calls.mostRecent().args[0]!;
      expect(params.action).toBeUndefined();
      expect(params.actions).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Ô lọc Phân hệ — lọc server-side theo mã', () => {
    it('moduleOptions KHÔNG tự thêm mục rỗng, đúng đủ tập mã đóng (BUG-050)', () => {
      taoTrang();
      const options = noiBo()['moduleOptions']() as { value: string; label: string }[];

      expect(options.length).toBe(AUDIT_MODULE_CODES.length);
      expect(options.some((option) => option.value === '')).toBe(false);
      expect(options.map((option) => option.value)).toEqual([...AUDIT_MODULE_CODES]);
    });

    it('chọn phân hệ thì GỬI tham số module lên máy chủ và nạp lại từ trang 1 (BUG-051)', () => {
      taoTrang();
      noiBo()['page'].set(4);
      api.getAuditLogs.calls.reset();

      // Người dùng chọn "Thu phí" trên sg-select — control gán mã vào form.module.
      noiBo()['form'].module = 'FEE';
      noiBo()['applyFilters']();

      expect(noiBo()['page']()).toBe(1);
      expect(api.getAuditLogs).toHaveBeenCalledWith(jasmine.objectContaining({ module: 'FEE', page: 1 }));
    });

    it('để phân hệ rỗng thì KHÔNG gửi tham số module', () => {
      taoTrang();
      api.getAuditLogs.calls.reset();

      noiBo()['form'].module = '';
      noiBo()['applyFilters']();

      const params = api.getAuditLogs.calls.mostRecent().args[0]!;
      expect(params.module).toBeUndefined();
    });

    it('suy nhãn phân hệ từ tiền tố action (FEE_/AUTH_) trước khi xét targetType', () => {
      taoTrang();
      expect(noiBo()['moduleOf'](dong({ action: 'FEE_TRANSACTION_CONFIRM', targetType: 'DECLARATION' }))).toBe('FEE');
      expect(noiBo()['moduleOf'](dong({ action: 'AUTH_LOGIN', targetType: 'USER' }))).toBe('SYSTEM');
      expect(noiBo()['moduleOf'](dong({ action: 'DECLARATION_SUBMIT', targetType: 'DECLARATION' }))).toBe('DOSSIER');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Kiểm tra khoảng ngày (BUG-052)', () => {
    it('Từ ngày > Đến ngày thì CHẶN tại chỗ, báo lỗi rõ và KHÔNG gọi API', () => {
      taoTrang();
      api.getAuditLogs.calls.reset();

      noiBo()['form'] = { actor: '', action: '', module: '', target: '', from: '2026-08-05', to: '2026-07-01' };
      noiBo()['applyFilters']();

      expect(api.getAuditLogs).not.toHaveBeenCalled();
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.tone === 'error' && m.text === 'Từ ngày phải trước hoặc bằng Đến ngày.')).toBe(true);
    });

    it('Từ ngày = Đến ngày (bằng nhau) thì cho qua và gọi API', () => {
      taoTrang();
      api.getAuditLogs.calls.reset();

      noiBo()['form'] = { actor: '', action: '', module: '', target: '', from: '2026-08-01', to: '2026-08-01' };
      noiBo()['applyFilters']();

      expect(api.getAuditLogs).toHaveBeenCalledWith(
        jasmine.objectContaining({ from: '2026-08-01', to: '2026-08-01', page: 1 }),
      );
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.tone === 'error')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Tóm tắt phân trang', () => {
    it('hiện dòng "Hiển thị a đến b trong tổng số N bản ghi" theo cửa sổ máy chủ (trang × pageSize)', () => {
      api.getAuditLogs.and.returnValue(of(trang([dong()], 45)));
      taoTrang();

      expect(noiBo()['summary']()).toBe('Hiển thị 1 đến 10 trong tổng số 45 bản ghi');
    });

    it('không có bản ghi thì tóm tắt báo trống', () => {
      api.getAuditLogs.and.returnValue(of(trang([], 0)));
      taoTrang();

      expect(noiBo()['summary']()).toBe('Không có bản ghi');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Xuất nhật ký (BUG-027)', () => {
    it('xuất tệp nhật ký thành công và hiển thị thông báo thành công', async () => {
      taoTrang();
      noiBo()['form'] = { actor: 'nvcong', action: 'DECLARATION_SUBMIT', target: '', from: '2026-07-01', to: '2026-07-31' };
      noiBo()['applyFilters']();
      spyOn(URL, 'createObjectURL').and.returnValue('blob:x');
      spyOn(URL, 'revokeObjectURL');
      const anchor = document.createElement('a');
      spyOn(anchor, 'click');
      spyOn(document, 'createElement').and.returnValue(anchor);

      noiBo()['exportLog']();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });

      expect(api.exportAuditLogs).toHaveBeenCalled();
      const params = api.exportAuditLogs.calls.mostRecent().args[0]!;
      expect(params).toEqual(
        jasmine.objectContaining({ actor: 'nvcong', action: 'DECLARATION_SUBMIT', from: '2026-07-01', to: '2026-07-31' }),
      );
      expect(anchor.click).toHaveBeenCalled();
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.tone === 'success')).toBe(true);
    });

    it('SG-225: khi người dùng hủy tại cửa sổ Save As -> hiển thị thông báo Hủy, không báo Thành công', async () => {
      const abortErr = new Error('The user aborted a request.');
      abortErr.name = 'AbortError';
      (window as unknown as Record<string, unknown>)['showSaveFilePicker'] = jasmine.createSpy('showSaveFilePicker').and.rejectWith(abortErr);

      taoTrang();
      noiBo()['exportLog']();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });

      const messages = TestBed.inject(AppMessageService).messages();
      expect(messages.some((m) => m.tone === 'success')).toBe(false);
      expect(messages.some((m) => m.tone === 'info')).toBe(true);
      delete (window as unknown as Record<string, unknown>)['showSaveFilePicker'];
    });

    it('lỗi xuất thì hiện thông báo lỗi, không ném ra ngoài', async () => {
      api.exportAuditLogs.and.returnValue(throwError(() => ({ status: 500, error: {} })));
      taoTrang();

      noiBo()['exportLog']();
      await new Promise((resolve) => { setTimeout(resolve, 50); });
      await fixture.whenStable();

      expect(TestBed.inject(AppMessageService).messages().some((m) => m.tone === 'error')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Chi tiết trước/sau', () => {
    it('mở chi tiết thì hiện bảng diff theo trường: nhãn tiếng Việt và giá trị thân thiện', () => {
      api.getAuditLogs.and.returnValue(
        of(trang([dong({ before: { status: 'DRAFT' }, after: { status: 'SUBMITTED' } })])),
      );
      taoTrang();

      noiBo()['openDetail'](noiBo()['rows']()[0]);
      fixture.detectChanges();

      const text = noiDung();
      expect(fixture.nativeElement.querySelector('sg-modal')).not.toBeNull();
      expect(text).toContain('Thay đổi dữ liệu');
      expect(text).toContain('Trạng thái'); // tên trường tiếng Việt (SG-142)
      expect(text).toContain('Nháp'); // giá trị cũ dịch tiếng Việt (SG-142)
      expect(text).toContain('Chờ vào cổng'); // giá trị mới dịch tiếng Việt (SG-142)
    });

    it('diffRows suy trường thêm/xóa/đổi từ before/after và định dạng nhãn tiếng Việt', () => {
      taoTrang();
      const rows = noiBo()['diffRows'](
        dong({ before: { status: 'DRAFT', note: 'x' }, after: { status: 'SUBMITTED', extra: 'y' } }),
      ) as { field: string; rawField: string; before: string; after: string; changed: boolean }[];

      const byRaw = (name: string) => rows.find((row) => row.rawField === name)!;
      expect(byRaw('status')).toEqual(jasmine.objectContaining({ field: 'Trạng thái', before: 'Nháp', after: 'Chờ vào cổng', changed: true }));
      expect(byRaw('note')).toEqual(jasmine.objectContaining({ field: 'Ghi chú', before: 'x', after: '—', changed: true }));
      expect(byRaw('extra')).toEqual(jasmine.objectContaining({ field: 'extra', before: '—', after: 'y', changed: true }));
    });

    it('cả trước và sau đều rỗng thì hiện thông báo không có dữ liệu', () => {
      api.getAuditLogs.and.returnValue(of(trang([dong({ before: null, after: null })])));
      taoTrang();

      noiBo()['openDetail'](noiBo()['rows']()[0]);
      fixture.detectChanges();

      expect(noiDung()).toContain('Không có dữ liệu trước/sau.');
    });

    it('đóng chi tiết thì gỡ hộp thoại khỏi màn hình', () => {
      taoTrang();
      noiBo()['openDetail'](noiBo()['rows']()[0]);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('sg-modal')).not.toBeNull();

      noiBo()['detail'].set(null);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('sg-modal')).toBeNull();
    });

    it('thao tác từ chối hồ sơ (DECLARATION_REJECT) hiển thị lý do trong trường Ghi chú và diff dữ liệu', () => {
      const denyRow = dong({
        action: 'DECLARATION_REJECT',
        targetType: 'DECLARATION',
        targetId: 'HS-250519-0015',
        after: {
          decision: 'DENY',
          note: 'Thiếu chứng thư kiểm dịch thực vật',
          blockingReasons: ['Chưa hoàn thành bước Kiểm dịch (Kiểm dịch)'],
        },
      });
      api.getAuditLogs.and.returnValue(of(trang([denyRow])));
      taoTrang();

      noiBo()['openDetail'](noiBo()['rows']()[0]);
      fixture.detectChanges();

      const modal = fixture.nativeElement.querySelector('sg-modal');
      expect(modal).not.toBeNull();
      expect(modal.textContent).toContain('Ghi chú');
      expect(modal.textContent).toContain('Thiếu chứng thư kiểm dịch thực vật');
      expect(modal.textContent).toContain('Thay đổi dữ liệu');
    });

    it('hiển thị đối tượng là hồ sơ gốc và không trùng lặp Mã hồ sơ khi sao chép hồ sơ (SG-233 và SG-246)', () => {
      const copyRow = dong({
        action: 'DECLARATION_COPY',
        targetType: 'DECLARATION',
        targetId: 'source-uuid-123',
        after: {
          code: 'IMP-20260825-000024',
          sourceId: 'source-uuid-123',
          sourceCode: 'IMP-20260824-000020',
          copiedId: 'copied-uuid-456',
          copiedCode: 'IMP-20260825-000024',
          attachments: 4,
        },
      });
      api.getAuditLogs.and.returnValue(of(trang([copyRow])));
      taoTrang();

      // SG-233: ĐỐI TƯỢNG hiển thị tên Hồ sơ gốc
      expect(noiBo()['friendlyTarget'](copyRow)).toBe('Hồ sơ IMP-20260824-000020');

      // SG-246: Chi tiết nhật ký chỉ hiển thị Mã hồ sơ gốc và Mã hồ sơ mới (đã loại bỏ ID, attachments, Mã hồ sơ thừa)
      const diff = noiBo()['diffRows'](copyRow);
      expect(diff.length).toBe(2);
      expect(diff.map((d: any) => d.field)).toEqual(['Mã hồ sơ mới', 'Mã hồ sơ gốc']);
      expect(diff.find((d: any) => d.rawField === 'sourceCode').after).toBe('IMP-20260824-000020');
      expect(diff.find((d: any) => d.rawField === 'copiedCode').after).toBe('IMP-20260825-000024');
    });

    it('hiển thị đối tượng kèm link đến chi tiết hồ sơ khi có targetId', () => {
      const row = dong({
        targetType: 'DECLARATION',
        targetId: 'decl-uuid-123',
        after: { dossierCode: 'EXP-20260811-000002' },
      });
      api.getAuditLogs.and.returnValue(of(trang([row])));
      taoTrang();

      expect(noiBo()['friendlyTarget'](row)).toBe('Hồ sơ EXP-20260811-000002');
      expect(noiBo()['targetLink'](row)).toEqual(['/declarations', 'decl-uuid-123']);
    });

    it('hiển thị tên đối tượng thân thiện cho nhóm danh mục, mục danh mục, tệp đính kèm, vai trò thay vì UUID', () => {
      taoTrang();

      // Nhóm danh mục
      const catTypeRow = dong({
        targetType: 'CATALOG_TYPE',
        targetId: '80c8229c-0a8b-4862-84b1-40fa3326e2a0',
        before: { name: 'Cửa khẩu', code: 'CHECKPOINT' },
      });
      expect(noiBo()['friendlyTarget'](catTypeRow)).toBe('Nhóm danh mục · Cửa khẩu');

      // Mục danh mục
      const catItemRow = dong({
        targetType: 'CATALOG_ITEM',
        targetId: '0a3321b4-1d3d-47ce-8718-c2753f06b065',
        after: { name: 'Hàng nông sản', code: 'AGRI' },
      });
      expect(noiBo()['friendlyTarget'](catItemRow)).toBe('Mục danh mục · Hàng nông sản');

      // Tệp đính kèm
      const attachRow = dong({
        targetType: 'ATTACHMENT',
        targetId: '8076e53f-1cb7-4b8b-8d59-eb24f1a6aa30',
        after: { originalName: 'to_khai_hai_quan.pdf' },
      });
      expect(noiBo()['friendlyTarget'](attachRow)).toBe('Tệp đính kèm · to_khai_hai_quan.pdf');

      // Vai trò
      const roleRow = dong({
        targetType: 'ROLE',
        targetId: 'role-uuid-1234-5678-90ab-cdef12345678',
        after: { name: 'Quản trị hệ thống', code: 'ADMIN' },
      });
      expect(noiBo()['friendlyTarget'](roleRow)).toBe('Vai trò · Quản trị hệ thống');

      // Cấu hình hệ thống với khóa chuẩn
      const yardConfigRow = dong({
        targetType: 'SYSTEM_SETTING',
        targetId: 'yard.maxStorageHours',
      });
      expect(noiBo()['friendlyTarget'](yardConfigRow)).toBe('Cấu hình hệ thống · Số giờ lưu bãi tối đa');

      // Báo cáo
      const reportRow = dong({
        targetType: 'REPORT',
        targetId: 'dossier-throughput',
      });
      expect(noiBo()['friendlyTarget'](reportRow)).toBe('Báo cáo · Lưu lượng hồ sơ theo ngày');

      // Nhật ký kiểm toán
      const auditLogRow = dong({
        targetType: 'AUDIT_LOG',
        targetId: 'audit-logs',
      });
      expect(noiBo()['friendlyTarget'](auditLogRow)).toBe('Nhật ký thao tác');

      // Đăng nhập / Tài khoản fallback theo username
      const userLoginRow = dong({
        targetType: 'USER',
        targetId: '80c8229c-0a8b-4862-84b1-40fa3326e2a0',
        actorUsername: 'admin',
        after: {},
      });
      expect(noiBo()['friendlyTarget'](userLoginRow)).toBe('Tài khoản admin');

      // Khi targetId là UUID và không có thông tin name trong before/after
      const fallbackRow = dong({
        targetType: 'CATALOG_ITEM',
        targetId: '0a3321b4-1d3d-47ce-8718-c2753f06b065',
        after: {},
      });
      expect(noiBo()['friendlyTarget'](fallbackRow)).toBe('Mục danh mục');
    });

    it('SG-142: dịch danh sách quyền sang tên hiển thị thân thiện trong bảng Diff', () => {
      taoTrang();
      const roleRow = dong({
        targetType: 'ROLE',
        before: { permissions: ['dossier.create', 'dossier.export', 'workflow.view'] },
        after: { permissions: ['dossier.export', 'workflow.view', 'yard.approve'] },
      });

      const diff = noiBo()['diffRows'](roleRow);
      const permDiff = diff.find((d: any) => d.rawField === 'permissions');
      expect(permDiff).toBeTruthy();
      expect(permDiff.before).toContain('Tạo hồ sơ');
      expect(permDiff.before).toContain('Xuất hồ sơ');
      expect(permDiff.before).toContain('Xem xử lý liên ngành');
      expect(permDiff.after).toContain('Duyệt bãi');
      expect(permDiff.after).not.toContain('dossier.create');
    });

    it('dịch danh sách mã quyền thô (như yard.approve, yard.create) thành tên tiếng Việt thân thiện', () => {
      taoTrang();
      const roleRow = dong({
        targetType: 'ROLE',
        before: { permissions: 'yard.approve, yard.create, Cập nhật bãi' },
        after: { permissions: 'yard.approve, yard.create, yard.delete, Cập nhật bãi' },
      });
      noiBo()['detail'].set(roleRow);
      fixture.detectChanges();

      const modalEl: HTMLElement = fixture.nativeElement;
      const textContent = modalEl.textContent || '';
      expect(textContent).toContain('Duyệt bãi, Tạo bãi');
      expect(textContent).toContain('Xóa bãi');
    });

    it('format danh sách đối tượng lỗi validation thành văn bản tiếng Việt sạch sẽ không chứa mã thô', () => {
      taoTrang();
      const errRow = dong({
        targetType: 'DECLARATION',
        after: {
          errors: [
            { field: 'appointment.scheduledAt', message: 'Vui lòng chọn ngày đăng ký vào cửa khẩu.' },
            { field: 'attachments.CUSTOMS_DECLARATION', message: 'Thiếu chứng từ bắt buộc: Tờ khai hải quan.', messageKey: 'dossier.missingDocument' },
          ],
        },
      });
      noiBo()['detail'].set(errRow);
      fixture.detectChanges();

      const diff = noiBo()['diffRows'](errRow);
      const errDiff = diff.find((d: any) => d.rawField === 'errors');
      expect(errDiff.after).toContain('Vui lòng chọn ngày đăng ký vào cửa khẩu.');
      expect(errDiff.after).toContain('Thiếu chứng từ bắt buộc: Tờ khai hải quan.');
      expect(errDiff.after).not.toContain('messageKey');
      expect(errDiff.after).not.toContain('field:');
    });

    it('SG-142: format đối tượng phức tạp như phương tiện, lái xe, hàng hóa thành văn bản thân thiện', () => {
      taoTrang();
      const dossierRow = dong({
        targetType: 'DECLARATION',
        after: {
          driver: { fullName: 'Trần Văn A', idNumber: '012345678901' },
          cargo: { description: 'Thanh long ruột đỏ', grossWeightKg: 15000 },
          isActive: true,
        },
      });

      const diff = noiBo()['diffRows'](dossierRow);
      const driverDiff = diff.find((d: any) => d.rawField === 'driver');
      expect(driverDiff.after).toContain('Trần Văn A');
      expect(driverDiff.after).toContain('012345678901');

      const activeDiff = diff.find((d: any) => d.rawField === 'isActive');
      expect(activeDiff.after).toBe('Hoạt động');
    });

    it('format trường ảnh base64 và tên trường actorId / avatar thân thiện trong bảng Diff', () => {
      taoTrang();
      const profileRow = dong({
        targetType: 'USER',
        before: {
          actorId: '6bc12d19-f82b-4e40-b706-02d980e673a7',
          avatarUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
        },
        after: {
          actorId: '6bc12d19-f82b-4e40-b706-02d980e673a7',
          avatarUrl: 'data:image/jpeg;base64,/9j/2wCEAAgGBgcGBQgHBwc...',
        },
      });

      const diff = noiBo()['diffRows'](profileRow);
      const actorIdDiff = diff.find((d: any) => d.rawField === 'actorId');
      expect(actorIdDiff).toBeTruthy();
      expect(actorIdDiff.field).toBe('ID người thao tác');

      const avatarDiff = diff.find((d: any) => d.rawField === 'avatarUrl');
      expect(avatarDiff).toBeTruthy();
      expect(avatarDiff.field).toBe('Ảnh đại diện');
      expect(avatarDiff.before).toBe('Ảnh cũ');
      expect(avatarDiff.after).toBe('Ảnh mới (đã cập nhật)');
    });

    it('SG-225: khi xuất file bị hủy (CANCELLED) hoặc thất bại (FAILED), gửi logExportResult báo cho máy chủ', async () => {
      taoTrang();
      const abortErr = new Error('The user aborted a request.');
      abortErr.name = 'AbortError';
      (window as unknown as Record<string, unknown>)['showSaveFilePicker'] = jasmine.createSpy('showSaveFilePicker').and.rejectWith(abortErr);

      noiBo()['exportLog']();
      await fixture.whenStable();

      expect(api.logExportResult).toHaveBeenCalledWith(
        jasmine.objectContaining({
          action: 'REPORT_EXPORT',
          targetType: 'AUDIT_LOG',
          result: 'CANCELLED',
        }),
      );
    });

    it('tạo mới tài khoản: targetRouteInfo điều hướng sang /admin/users với keyword search username', () => {
      taoTrang();
      const createRow = dong({
        action: 'USER_CREATE',
        targetType: 'USER',
        targetId: 'user-123',
        after: { username: 'testuser', displayName: 'Người dùng Test' },
      });

      const routeInfo = noiBo()['targetRouteInfo'](createRow);
      expect(routeInfo).toEqual({
        commands: ['/admin/users'],
        queryParams: { keyword: 'testuser' },
      });
    });

    it('xóa tài khoản: targetRouteInfo trả về null và diffRows ẩn trường defaultRoute', () => {
      taoTrang();
      const deleteRow = dong({
        action: 'USER_DELETE',
        targetType: 'USER',
        targetId: 'user-123',
        before: { username: 'testuser', defaultRoute: '/declarations', email: 'test@example.com' },
        after: {},
      });

      const routeInfo = noiBo()['targetRouteInfo'](deleteRow);
      expect(routeInfo).toBeNull();

      const diff = noiBo()['diffRows'](deleteRow);
      const defaultRouteDiff = diff.find((d: any) => d.rawField === 'defaultRoute');
      expect(defaultRouteDiff).toBeUndefined();
      const emailDiff = diff.find((d: any) => d.rawField === 'email');
      expect(emailDiff).toBeTruthy();
    });

    it('format defaultRoute thành tên menu thân thiện đa ngôn ngữ không có dấu /', () => {
      taoTrang();
      const userUpdateRow = dong({
        action: 'USER_UPDATE',
        targetType: 'USER',
        targetId: 'user-123',
        before: { defaultRoute: '/declarations' },
        after: { defaultRoute: '/operations/dashboard' },
      });

      const diff = noiBo()['diffRows'](userUpdateRow);
      const defaultRouteDiff = diff.find((d: any) => d.rawField === 'defaultRoute');
      expect(defaultRouteDiff).toBeTruthy();
      expect(defaultRouteDiff.before).toBe('Hồ sơ');
      expect(defaultRouteDiff.after).toBe('Tổng quan');
      expect(defaultRouteDiff.before).not.toContain('/');
      expect(defaultRouteDiff.after).not.toContain('/');

      // Khi đổi sang tiếng Anh
      const i18n = TestBed.inject(I18nService);
      i18n.setLocale('en');
      const diffEn = noiBo()['diffRows'](userUpdateRow);
      const defaultRouteDiffEn = diffEn.find((d: any) => d.rawField === 'defaultRoute');
      expect(defaultRouteDiffEn.before).toBe('Declarations');
      expect(defaultRouteDiffEn.after).toBe('Dashboard');
      i18n.setLocale('vi'); // trả lại mặc định để không rò sang test khác
    });

    it('format defaultRoute ánh xạ đúng cho các route con và phân hệ phụ (dispatch/history, fees/rules...)', () => {
      taoTrang();
      const historyRow = dong({
        action: 'USER_UPDATE',
        targetType: 'USER',
        targetId: 'user-123',
        before: { defaultRoute: '/dispatch/history' },
        after: { defaultRoute: '/fees/rules' },
      });

      const diff = noiBo()['diffRows'](historyRow);
      const defaultRouteDiff = diff.find((d: any) => d.rawField === 'defaultRoute');
      expect(defaultRouteDiff.before).toBe('Điều phối');
      expect(defaultRouteDiff.after).toBe('Quản trị biểu phí');
    });

    it('DECLARATION_CANCEL vẫn giữ link điều hướng tới hồ sơ', () => {
      taoTrang();
      const cancelRow = dong({
        action: 'DECLARATION_CANCEL',
        targetType: 'DECLARATION',
        targetId: 'hs-123',
      });
      const routeInfo = noiBo()['targetRouteInfo'](cancelRow);
      expect(routeInfo).toEqual({
        commands: ['/declarations', 'hs-123'],
      });
    });

    it('AUTH_LOGIN có targetType=USER nhưng không sinh link điều hướng /admin/users', () => {
      taoTrang();
      const loginRow = dong({
        action: 'AUTH_LOGIN',
        targetType: 'USER',
        targetId: 'user-123',
        after: { username: 'testuser' },
      });
      const routeInfo = noiBo()['targetRouteInfo'](loginRow);
      expect(routeInfo).toBeNull();
    });

    it('hành động có chữ USER nhưng targetType=ROLE không nhảy sang /admin/users', () => {
      taoTrang();
      const roleRow = dong({
        action: 'USER_ROLES_REPLACE',
        targetType: 'ROLE',
        targetId: 'role-123',
      });
      const routeInfo = noiBo()['targetRouteInfo'](roleRow);
      expect(routeInfo).toBeNull();
    });

    it('USER_UPDATE ưu tiên before.username trước displayName', () => {
      taoTrang();
      const updateRow = dong({
        action: 'USER_UPDATE',
        targetType: 'USER',
        targetId: 'user-123',
        before: { username: 'testuser', displayName: 'Tên Cũ' },
        after: { displayName: 'Tên Mới' },
      });
      const routeInfo = noiBo()['targetRouteInfo'](updateRow);
      expect(routeInfo).toEqual({
        commands: ['/admin/users'],
        queryParams: { keyword: 'testuser' },
      });
    });

    it('FEE_WORKBENCH_ACTION hiển thị trường và giá trị thân thiện tiếng Việt trong bảng thay đổi dữ liệu', () => {
      taoTrang();
      const feeRow = dong({
        action: 'FEE_WORKBENCH_ACTION',
        targetType: 'DECLARATION',
        targetId: 'hs-123',
        before: null,
        after: {
          feeAction: 'SUPPLEMENT_PAYMENT',
          slug: 'tax',
          amount: 112057002,
          note: 'kiểm tra lại',
        },
      });
      const diff = noiBo()['diffRows'](feeRow);
      expect(diff.length).toBe(4);

      const feeActionDiff = diff.find((d: any) => d.rawField === 'feeAction');
      expect(feeActionDiff).toBeDefined();
      expect(feeActionDiff.field).toBe('Thao tác thu phí');
      expect(feeActionDiff.after).toBe('Yêu cầu thanh toán bổ sung');

      const slugDiff = diff.find((d: any) => d.rawField === 'slug');
      expect(slugDiff).toBeDefined();
      expect(slugDiff.field).toBe('Màn hình thu phí');
      expect(slugDiff.after).toBe('Thu phí tờ khai');

      const amountDiff = diff.find((d: any) => d.rawField === 'amount');
      expect(amountDiff).toBeDefined();
      expect(amountDiff.field).toBe('Số tiền');
      expect(amountDiff.after).toBe('112.057.002 VNĐ');

      const noteDiff = diff.find((d: any) => d.rawField === 'note');
      expect(noteDiff).toBeDefined();
      expect(noteDiff.field).toBe('Ghi chú');
      expect(noteDiff.after).toBe('kiểm tra lại');
    });

    it('định dạng tiền tệ và trạng thái tất toán cho các trường thu phí', () => {
      taoTrang();
      const feeCollectRow = dong({
        action: 'FEE_TRANSACTION_COLLECT',
        targetType: 'DECLARATION',
        targetId: 'hs-123',
        before: { outstanding: 1000000, settled: false },
        after: { outstanding: 0, settled: true },
      });
      const diff = noiBo()['diffRows'](feeCollectRow);

      const outstandingDiff = diff.find((d: any) => d.rawField === 'outstanding');
      expect(outstandingDiff.field).toBe('Số tiền còn thiếu');
      expect(outstandingDiff.before).toBe('1.000.000 VNĐ');
      expect(outstandingDiff.after).toBe('0 VNĐ');

      const settledDiff = diff.find((d: any) => d.rawField === 'settled');
      expect(settledDiff.field).toBe('Đã tất toán');
      expect(settledDiff.before).toBe('Chưa thanh toán đủ');
      expect(settledDiff.after).toBe('Đã thanh toán đủ');
    });

    it('hiển thị nhãn diffTypeLabel chuẩn xác theo đa ngôn ngữ (VI/EN)', () => {
      taoTrang();
      const i18n = TestBed.inject(I18nService);

      const addedChange = { rawField: 'f1', field: 'Trường 1', before: '—', after: 'Giá trị mới', changed: true };
      const updatedChange = { rawField: 'f2', field: 'Trường 2', before: 'Cũ', after: 'Mới', changed: true };
      const removedChange = { rawField: 'f3', field: 'Trường 3', before: 'Cũ', after: '—', changed: true };
      const unchangedChange = { rawField: 'f4', field: 'Trường 4', before: 'Giữ nguyên', after: 'Giữ nguyên', changed: false };

      // Tiếng Việt
      i18n.setLocale('vi');
      expect(noiBo()['diffType'](addedChange)).toBe('added');
      expect(noiBo()['diffTypeLabel'](addedChange)).toBe('Thêm mới');

      expect(noiBo()['diffType'](updatedChange)).toBe('updated');
      expect(noiBo()['diffTypeLabel'](updatedChange)).toBe('Cập nhật');

      expect(noiBo()['diffType'](removedChange)).toBe('removed');
      expect(noiBo()['diffTypeLabel'](removedChange)).toBe('Đã xóa');

      expect(noiBo()['diffType'](unchangedChange)).toBe('unchanged');
      expect(noiBo()['diffTypeLabel'](unchangedChange)).toBe('Không đổi');

      // Tiếng Anh
      i18n.setLocale('en');
      expect(noiBo()['diffTypeLabel'](addedChange)).toBe('Added');
      expect(noiBo()['diffTypeLabel'](updatedChange)).toBe('Updated');
      expect(noiBo()['diffTypeLabel'](removedChange)).toBe('Removed');
      expect(noiBo()['diffTypeLabel'](unchangedChange)).toBe('Unchanged');
    });
  });
});
