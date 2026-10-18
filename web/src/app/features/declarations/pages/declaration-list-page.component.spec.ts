import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { AccessProfile } from '../../../core/auth/access-control.model';
import { SESSION_STORAGE_KEY } from '../../../core/auth/session.storage';
import { DossierSummary } from '../../../core/models/declaration.model';
import { ApiService, Paged } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { DeclarationListPageComponent } from './declaration-list-page.component';

/**
 * UI-03 Danh sách hồ sơ (P2).
 * SRS 8.1 bắt buộc mọi danh sách phải có: tìm kiếm, lọc, phân trang, trạng thái rỗng,
 * trạng thái tải và thông báo lỗi — phần lớn test dưới đây phủ đúng 6 yêu cầu đó.
 */

const QUYEN_DAY_DU = ['dossier.view', 'dossier.create', 'dossier.update', 'dossier.delete'];

function hoSoTruyCap(permissions: string[] = QUYEN_DAY_DU): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'doanhnghiep',
      displayName: 'Nguyễn Văn A',
      title: 'Nhân viên khai báo',
      email: 'a@dn.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: null,
    },
    roles: [{ code: 'DOANH_NGHIEP', name: 'Doanh nghiệp', dataScope: 'OWN' }],
    permissions,
    assignments: [],
    menu: [{ key: 'dossier', label: 'Hồ sơ', icon: 'folder', route: '/declarations' }],
  };
}

function hoSo(mau: Partial<DossierSummary> = {}): DossierSummary {
  return {
    id: 'hs-1',
    code: 'HS-250519-0015',
    type: 'IMPORT',
    status: 'DRAFT',
    enterprise: { taxCode: '5501234567', name: 'Cty CP Nông sản Tây Bắc' },
    vehicle: { plateNumber: '26C-123.45', containerNumber: 'TCLU8765432' },
    vehicles: [{ plateNumber: '26C-123.45', containerNumber: 'TCLU8765432' }],
    driver: { fullName: 'Nguyễn Văn Hùng', idNumber: '012345678901' },
    cargoSummary: 'Ngô hạt',
    checkpoint: 'SMART_GATE',
    createdAt: '2026-07-22T01:00:00.000Z',
    updatedAt: '2026-07-22T01:00:00.000Z',
    submittedAt: null,
    ...mau,
  };
}

function trang(items: DossierSummary[], total = items.length, page = 1, pageSize = 10): Paged<DossierSummary> {
  return { items, total, page, pageSize };
}

describe('DeclarationListPageComponent — danh sách hồ sơ', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<DeclarationListPageComponent>;
  let component: DeclarationListPageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function taoTrang(queryParams: Record<string, string> = {}): void {
    TestBed.configureTestingModule({
      imports: [DeclarationListPageComponent],
      providers: [
        provideRouter([
          { path: 'declarations', children: [] },
          { path: 'declarations/new', children: [] },
          { path: 'declarations/:id', children: [] },
          { path: 'declarations/:id/edit', children: [] },
        ]),
        { provide: ApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(queryParams)) } },
      ],
    });

    fixture = TestBed.createComponent(DeclarationListPageComponent);
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
      'getDeclarations',
      'deleteDeclaration',
      'cancelDeclaration',
      'getAccessProfile',
      'getDossierTypes',
      'getCheckpoints',
    ]);
    api.getDeclarations.and.returnValue(of(trang([hoSo()])));
    api.cancelDeclaration.and.returnValue(of({ cancelled: true }));
    api.deleteDeclaration.and.returnValue(of({ deleted: true }));
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
    it('đang tải thì hiện dòng "Đang tải danh sách hồ sơ..."', () => {
      api.getDeclarations.and.returnValue(NEVER);
      taoTrang();

      expect(noiBo()['loading']()).toBe(true);
      expect(noiDungBang()).toContain('Đang tải danh sách hồ sơ');
    });

    it('không có hồ sơ nào và không lọc gì thì gợi ý tạo hồ sơ đầu tiên', () => {
      api.getDeclarations.and.returnValue(of(trang([])));
      taoTrang();

      expect(noiDungBang()).toContain('Chưa có hồ sơ nào. Hãy tạo hồ sơ đầu tiên.');
    });

    it('đang lọc mà không có kết quả thì gợi ý đặt lại bộ lọc', () => {
      api.getDeclarations.and.returnValue(of(trang([])));
      taoTrang({ status: 'COMPLETED' });

      expect(noiBo()['hasActiveFilters']()).toBe(true);
      expect(noiDungBang()).toContain('Không có hồ sơ nào khớp điều kiện lọc');
    });

    it('API lỗi thì hiện thông báo lỗi và bảng rỗng', () => {
      api.getDeclarations.and.returnValue(throwError(() => new Error('mat ket noi')));
      taoTrang();

      expect(noiBo()['error']()).toBe('Không tải được danh sách hồ sơ. Vui lòng kiểm tra kết nối và thử lại.');
      expect(noiBo()['items']().length).toBe(0);
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.text.includes('Không tải được danh sách hồ sơ'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Tìm kiếm và lọc', () => {
    it('gửi đúng tham số lọc và phân trang lên API', () => {
      taoTrang();
      noiBo()['filters'].keyword = '  26C-123.45  ';
      noiBo()['filters'].type = 'IMPORT';
      noiBo()['filters'].status = 'SUBMITTED';
      noiBo()['filters'].from = '2026-07-01';
      noiBo()['filters'].to = '2026-07-22';

      noiBo()['applyFilters']();

      expect(api.getDeclarations.calls.mostRecent().args[0]).toEqual({
        keyword: '26C-123.45',
        type: 'IMPORT',
        status: 'SUBMITTED',
        from: '2026-07-01',
        to: '2026-07-22',
        page: 1,
        pageSize: 10,
      });
    });

    it('nhận bộ lọc từ query param khi được điều hướng sang', () => {
      taoTrang({ status: 'PROCESSING', type: 'EXPORT', keyword: 'HS-2505' });

      expect(noiBo()['filters']).toEqual(jasmine.objectContaining({ status: 'PROCESSING', type: 'EXPORT', keyword: 'HS-2505' }));
      expect(api.getDeclarations.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ status: 'PROCESSING', type: 'EXPORT', keyword: 'HS-2505' }));
    });

    it('drilldown KPI "Đang xử lý": nhận statusGroup, gửi statusGroup và bỏ trống status', () => {
      taoTrang({ statusGroup: 'IN_PROGRESS' });

      // Một trường lọc `status` hiển thị mã nhóm để dropdown chọn đúng ô "Đang xử lý (liên ngành)".
      expect(noiBo()['filters'].status).toBe('IN_PROGRESS');
      // Gửi qua `statusGroup`; KHÔNG gửi `status` là mã nhóm (sẽ trượt @IsEnum của API) — để trống.
      expect(api.getDeclarations.calls.mostRecent().args[0]).toEqual(
        jasmine.objectContaining({ statusGroup: 'IN_PROGRESS', status: '' }),
      );
    });

    it('ô lọc trạng thái có đủ 10 trạng thái theo luồng nghiệp vụ', () => {
      taoTrang();
      const options = noiBo()['statusOptions']() as Array<{ value: string; label: string }>;

      expect(options.map((o) => o.value)).toEqual([
        'DRAFT',
        'WAITING_GATE',
        'WAITING_CALL',
        'BUSINESS_PROCESSING',
        'REVISION_REQUIRED',
        'WAITING_FOR_FEE',
        'READY_FOR_EXIT',
        'COMPLETED',
        'REJECTED',
        'CANCELLED',
      ]);
      expect(options.find((o) => o.value === 'BUSINESS_PROCESSING')?.label).toBe('Đang xử lý nghiệp vụ');
    });

    it('đặt lại bộ lọc thì xóa hết điều kiện và tải lại từ trang 1', () => {
      taoTrang({ status: 'PROCESSING', from: '2026-08-01', to: '2026-08-18' });
      noiBo()['page'].set(3);

      noiBo()['resetFilters']();

      expect(noiBo()['hasActiveFilters']()).toBe(false);
      expect(noiBo()['filters'].from).toBe('');
      expect(noiBo()['filters'].to).toBe('');
      expect(noiBo()['page']()).toBe(1);
      expect(api.getDeclarations.calls.mostRecent().args[0]).toEqual(
        jasmine.objectContaining({ status: '', keyword: '', from: '', to: '', page: 1 }),
      );
    });

    // -------------------------------------------------------------------------
    // CR2 — lọc theo cờ dịch tễ (epidemic)
    it('lọc "chỉ hồ sơ có cờ dịch tễ" thì gửi epidemic = true lên API', () => {
      taoTrang();
      noiBo()['filters'].epidemic = 'true';

      noiBo()['applyFilters']();

      expect(api.getDeclarations.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ epidemic: true }));
    });

    it('không lọc dịch tễ thì KHÔNG đính kèm tham số epidemic', () => {
      taoTrang();

      expect(api.getDeclarations.calls.mostRecent().args[0]!.epidemic).toBeUndefined();
    });

    it('nhận cờ dịch tễ từ query param khi được điều hướng sang', () => {
      taoTrang({ epidemic: 'true' });

      expect(noiBo()['filters'].epidemic).toBe('true');
      expect(api.getDeclarations.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ epidemic: true }));
    });
  });

  // ---------------------------------------------------------------------------
  describe('CR2 — badge dịch tễ trên dòng hồ sơ', () => {
    it('hồ sơ có epidemicFlag hiện badge "Dịch tễ"', () => {
      api.getDeclarations.and.returnValue(of(trang([hoSo({ epidemicFlag: true })])));
      taoTrang();

      expect(fixture.nativeElement.querySelector('.epidemic')).not.toBeNull();
      expect(noiDungBang()).toContain('Dịch tễ');
    });

    it('hồ sơ không có cờ thì không hiện badge', () => {
      api.getDeclarations.and.returnValue(of(trang([hoSo({ epidemicFlag: false })])));
      taoTrang();

      expect(fixture.nativeElement.querySelector('.epidemic')).toBeNull();
      expect(noiDungBang()).not.toContain('Dịch tễ');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Phân trang', () => {
    beforeEach(() => {
      api.getDeclarations.and.returnValue(of(trang([hoSo()], 45)));
      taoTrang();
    });

    it('tính số trang theo tổng bản ghi của API', () => {
      expect(noiBo()['totalPages']()).toBe(5);
      expect(noiBo()['summary']()).toBe('Hiển thị 1 đến 10 trong tổng số 45 hồ sơ');
    });

    it('chuyển trang thì gọi lại API với số trang mới', () => {
      noiBo()['goToPage'](2);

      expect(noiBo()['page']()).toBe(2);
      expect(api.getDeclarations.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ page: 2 }));
    });

    it('không vượt quá trang đầu và trang cuối', () => {
      noiBo()['goToPage'](0);
      expect(noiBo()['page']()).toBe(1);

      noiBo()['goToPage'](99);
      expect(noiBo()['page']()).toBe(5);
    });

    it('đổi số dòng mỗi trang thì quay về trang 1', () => {
      noiBo()['goToPage'](3);
      noiBo()['changePageSize']('50');

      expect(noiBo()['pageSize']()).toBe(50);
      expect(noiBo()['page']()).toBe(1);
      expect(api.getDeclarations.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ page: 1, pageSize: 50 }));
    });
  });

  // ---------------------------------------------------------------------------
  describe('Hiển thị dòng và hành động theo quyền', () => {
    it('hiện đủ doanh nghiệp, biển số, lái xe, hàng hóa và chip trạng thái', () => {
      taoTrang();
      const noiDung = noiDungBang();

      expect(noiDung).toContain('HS-250519-0015');
      expect(noiDung).toContain('Cty CP Nông sản Tây Bắc');
      expect(noiDung).toContain('26C-123.45');
      expect(noiDung).toContain('Nguyễn Văn Hùng');
      expect(noiDung).toContain('Ngô hạt');
      expect((fixture.nativeElement.querySelector('.chip') as HTMLElement).textContent).toContain('Bản nháp');
    });

    it('hồ sơ chưa khai lái xe vẫn hiển thị được', () => {
      api.getDeclarations.and.returnValue(of(trang([hoSo({ driver: null, cargoSummary: '' })])));
      taoTrang();

      expect(noiDungBang()).toContain('Chưa khai lái xe');
      expect(noiDungBang()).toContain('Chưa khai hàng hóa');
    });

    it('chỉ hồ sơ nháp mới được sửa và xóa', () => {
      taoTrang();

      expect(noiBo()['canEdit'](hoSo({ status: 'DRAFT' }))).toBe(true);
      expect(noiBo()['canEdit'](hoSo({ status: 'REVISION_REQUIRED' }))).toBe(true);
      expect(noiBo()['canEdit'](hoSo({ status: 'PROCESSING' }))).toBe(false);

      expect(noiBo()['canDelete'](hoSo({ status: 'DRAFT' }))).toBe(true);
      expect(noiBo()['canDelete'](hoSo({ status: 'SUBMITTED' }))).toBe(false);
    });

    it('thiếu quyền thì không hiện nút sửa/xóa dù hồ sơ đang là nháp', () => {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token', profile: hoSoTruyCap(['dossier.view']) }));
      taoTrang();

      expect(noiBo()['canEdit'](hoSo({ status: 'DRAFT' }))).toBe(false);
      expect(noiBo()['canDelete'](hoSo({ status: 'DRAFT' }))).toBe(false);
    });

    it('xóa hồ sơ: xác nhận rồi gọi API và tải lại danh sách', () => {
      taoTrang();
      const soLanGoiTruoc = api.getDeclarations.calls.count();

      noiBo()['askDelete'](hoSo());
      expect(noiBo()['deleteTarget']()).not.toBeNull();

      noiBo()['confirmDelete']();

      expect(api.deleteDeclaration).toHaveBeenCalledOnceWith('hs-1');
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.text === 'Đã xóa hồ sơ HS-250519-0015.')).toBe(true);
      expect(api.getDeclarations.calls.count()).toBe(soLanGoiTruoc + 1);
    });

    it('xóa lỗi thì báo lỗi và đóng hộp xác nhận', () => {
      api.deleteDeclaration.and.returnValue(throwError(() => new Error('loi')));
      taoTrang();

      noiBo()['askDelete'](hoSo());
      noiBo()['confirmDelete']();

      expect(noiBo()['deleteTarget']()).toBeNull();
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.text === 'Không xóa được hồ sơ HS-250519-0015. Vui lòng thử lại.')).toBe(true);
    });

    it('hồ sơ ở trạng thái Chờ vào cổng có thể hủy bởi Doanh nghiệp hoặc Admin (SG-130)', () => {
      taoTrang();

      expect(noiBo()['canCancel'](hoSo({ status: 'WAITING_GATE' }))).toBe(true);
      expect(noiBo()['canCancel'](hoSo({ status: 'SUBMITTED' }))).toBe(true);
      expect(noiBo()['canCancel'](hoSo({ status: 'DRAFT' }))).toBe(false);
      expect(noiBo()['canCancel'](hoSo({ status: 'COMPLETED' }))).toBe(false);
    });

    it('hủy hồ sơ: xác nhận và gửi lý do gọi API rồi nạp lại danh sách (SG-130)', () => {
      taoTrang();
      const soLanGoiTruoc = api.getDeclarations.calls.count();

      noiBo()['askCancel'](hoSo({ status: 'WAITING_GATE' }));
      expect(noiBo()['cancelTarget']()).not.toBeNull();

      noiBo()['cancelReason'] = 'Doanh nghiệp thay đổi kế hoạch';
      noiBo()['confirmCancel']();

      expect(api.cancelDeclaration).toHaveBeenCalledOnceWith('hs-1', { note: 'Doanh nghiệp thay đổi kế hoạch' });
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.text === 'Đã hủy hồ sơ HS-250519-0015.')).toBe(true);
      expect(api.getDeclarations.calls.count()).toBe(soLanGoiTruoc + 1);
    });

    it('hủy hồ sơ: để trống hoặc chỉ nhập khoảng trắng thì báo lỗi và không gọi API', () => {
      taoTrang();
      const soLanGoiTruoc = api.cancelDeclaration.calls.count();

      noiBo()['askCancel'](hoSo({ status: 'WAITING_GATE' }));
      noiBo()['cancelReason'] = '   ';
      noiBo()['confirmCancel']();

      expect(api.cancelDeclaration.calls.count()).toBe(soLanGoiTruoc);
      expect(noiBo()['cancelReasonError']()).toBe('Vui lòng nhập lý do hủy hồ sơ');
      expect(noiBo()['cancelTarget']()).not.toBeNull();

      // Khi người dùng gõ lý do hợp lệ, lỗi được xóa bỏ
      noiBo()['cancelReason'] = 'Lý do hợp lệ';
      noiBo()['onCancelReasonChange']();
      expect(noiBo()['cancelReasonError']()).toBe('');
    });

    it('hủy hồ sơ lỗi thì báo lỗi (SG-130)', () => {
      api.cancelDeclaration.and.returnValue(throwError(() => new Error('Lỗi')));
      taoTrang();

      noiBo()['askCancel'](hoSo({ status: 'WAITING_GATE' }));
      noiBo()['cancelReason'] = 'Doanh nghiệp hủy do sự cố';
      noiBo()['confirmCancel']();

      expect(noiBo()['cancelTarget']()).toBeNull();
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.text === 'Không hủy được hồ sơ HS-250519-0015. Vui lòng thử lại.')).toBe(true);
    });
  });

  describe('SG-281: enterpriseIdentifier trong danh sách', () => {
    it('hiển thị tiền tố MST cho doanh nghiệp', () => {
      taoTrang();
      const item = hoSo({ enterprise: { taxCode: '5501234567', name: 'Công ty CP Tây Bắc' } });
      expect(noiBo()['enterpriseIdentifier'](item)).toBe('MST 5501234567');
    });

    it('hiển thị tiền tố Số CCCD / Hộ chiếu cho cá nhân khi taxCode rỗng', () => {
      taoTrang();
      const item = hoSo({ enterprise: { taxCode: '', idNumber: '038090001234', accountType: 'INDIVIDUAL', name: 'Nguyễn Văn A' } });
      expect(noiBo()['enterpriseIdentifier'](item)).toBe('Số CCCD / Hộ chiếu: 038090001234');
    });

    it('hiển thị email cho nội bộ khi taxCode rỗng', () => {
      taoTrang();
      const item = hoSo({ enterprise: { taxCode: '', email: 'canbo@smartgate.vn', accountType: 'INTERNAL', name: 'Lê Cán Bộ' } });
      expect(noiBo()['enterpriseIdentifier'](item)).toBe('canbo@smartgate.vn');
    });
  });
});
