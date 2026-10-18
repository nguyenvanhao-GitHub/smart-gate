import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccessProfile } from '../../../core/auth/access-control.model';
import { SESSION_STORAGE_KEY } from '../../../core/auth/session.storage';
import { CatalogItem, CatalogType, CatalogTypePayload, Paginated } from '../../../core/models/admin.model';
import { ApiService } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { CatalogAdminPageComponent } from './catalog-admin-page.component';

/**
 * F04 — Danh mục dùng chung.
 *
 * Bộ test khóa những điều quan trọng nhất của màn hình: hiện đủ nhóm danh mục, chọn nhóm thì nạp
 * đúng mục theo mã nhóm, **thêm thiếu mã/tên bị chặn ngay ở web**, **mục đã khóa không cho sửa**
 * (giữ toàn vẹn dữ liệu lịch sử) và **khóa phải qua bước xác nhận**. Đồng thời khẳng định ranh giới
 * nghiệp vụ: danh mục **chỉ khóa, không xóa vật lý**.
 */

function hoSoTruyCap(permissions: string[] = ['catalog.view', 'catalog.create', 'catalog.update']): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'quantri',
      displayName: 'Nguyễn Văn Quản',
      title: 'Quản trị danh mục',
      email: 'quantri@chc.gov.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: null,
    },
    roles: [{ code: 'QUAN_TRI', name: 'Quản trị hệ thống', dataScope: 'ALL' }],
    permissions,
    assignments: [],
    menu: [],
  };
}

const dsNhom: CatalogType[] = [
  { id: 't-1', code: 'gates', name: 'Cổng kiểm soát', description: 'Các cổng kiểm soát vật lý tại cửa khẩu', isSystem: true, sortOrder: 1, itemCount: 4 },
  { id: 't-2', code: 'cargo_types', name: 'Loại hàng', description: null, isSystem: false, sortOrder: 2, itemCount: 7 },
];

function nhom(mau: Partial<CatalogType> = {}): CatalogType {
  return { id: 't-9', code: 'payment_methods', name: 'Hình thức thanh toán', description: null, isSystem: false, sortOrder: 9, itemCount: 0, ...mau };
}

function muc(mau: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'i-1',
    typeCode: 'gates',
    code: 'GATE_A',
    name: 'Cổng A',
    sortOrder: 1,
    status: 'ACTIVE',
    metadata: null,
    createdAt: '2026-07-01T02:00:00.000Z',
    updatedAt: '2026-07-20T03:30:00.000Z',
    ...mau,
  };
}

function trang(items: CatalogItem[], total = items.length, page = 1, pageSize = 10): Paginated<CatalogItem> {
  return { items, total, page, pageSize };
}

const dsMuc: CatalogItem[] = [
  muc(),
  muc({ id: 'i-2', code: 'GATE_B', name: 'Cổng B', status: 'LOCKED', sortOrder: 2 }),
];

describe('CatalogAdminPageComponent — danh mục dùng chung (F04)', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<CatalogAdminPageComponent>;
  let component: CatalogAdminPageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function noiDungTrang(): string {
    return (fixture.nativeElement as HTMLElement).textContent || '';
  }

  /** Có toast đúng tông + đúng nội dung đang hiển thị hay không. */
  function coToast(tone: string, text: string): boolean {
    return TestBed.inject(AppMessageService).messages().some((m) => m.tone === tone && m.text === text);
  }

  function taoTrang(quyen?: string[]): void {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap(quyen) }));

    TestBed.configureTestingModule({
      imports: [CatalogAdminPageComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });

    fixture = TestBed.createComponent(CatalogAdminPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getCatalogTypes',
      'createCatalogType',
      'updateCatalogType',
      'deleteCatalogType',
      'getCatalogItems',
      'createCatalogItem',
      'updateCatalogItem',
      'lockCatalogItem',
      'unlockCatalogItem',
      'deleteCatalogItem',
    ]);
    api.getCatalogTypes.and.returnValue(of(dsNhom));
    api.createCatalogType.and.returnValue(of(nhom()));
    api.updateCatalogType.and.returnValue(of(nhom({ id: 't-2', code: 'cargo_types', name: 'Loại hàng hóa' })));
    api.deleteCatalogType.and.returnValue(of(undefined));
    api.getCatalogItems.and.returnValue(of(trang(dsMuc)));
    api.createCatalogItem.and.returnValue(of(muc({ id: 'i-3', code: 'GATE_C', name: 'Cổng C' })));
    api.updateCatalogItem.and.returnValue(of(muc({ name: 'Cổng A1' })));
    api.lockCatalogItem.and.returnValue(of(muc({ status: 'LOCKED' })));
    api.unlockCatalogItem.and.returnValue(of(muc({ id: 'i-2', code: 'GATE_B', name: 'Cổng B', status: 'ACTIVE' })));
    api.deleteCatalogItem.and.returnValue(of(undefined));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    sessionStorage.clear();
  });

  // ---------------------------------------------------------------------------
  describe('Nhóm danh mục và mục trong nhóm', () => {
    it('hiện đủ nhóm danh mục', () => {
      taoTrang();
      const noiDung = noiDungTrang();

      expect(api.getCatalogTypes).toHaveBeenCalled();
      expect(noiDung).toContain('Cổng kiểm soát');
      expect(noiDung).toContain('Loại hàng');
    });

    it('giữ tên nhóm đầy đủ trong tooltip để phần hiển thị có thể ẩn phần dư khỏi box', () => {
      const tenDai = 'Tên nhóm danh mục rất dài '.repeat(7).trim();
      api.getCatalogTypes.and.returnValue(of([nhom({ name: tenDai })]));

      taoTrang();

      const tenNhom = (fixture.nativeElement as HTMLElement).querySelector('.type-item__name');
      expect(tenNhom?.getAttribute('title')).toBe(tenDai);
      expect(tenNhom?.textContent?.trim()).toBe(tenDai);
    });

    it('tự chọn nhóm đầu tiên và nạp mục theo mã nhóm khi mở trang', () => {
      taoTrang();

      expect(component['selectedType']()?.code).toBe('gates');
      expect(api.getCatalogItems).toHaveBeenCalledWith('gates', {
        keyword: '',
        status: '',
        page: 1,
        pageSize: 10,
      });
      expect(noiDungTrang()).toContain('Cổng A');
    });

    it('chọn nhóm khác thì nạp mục của nhóm đó và cuộn lên đầu màn hình', () => {
      taoTrang();
      api.getCatalogItems.calls.reset();
      const scrollToSpy = spyOn<any>(window, 'scrollTo');

      component['selectType'](dsNhom[1]);

      expect(api.getCatalogItems).toHaveBeenCalledWith('cargo_types', {
        keyword: '',
        status: '',
        page: 1,
        pageSize: 10,
      });
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    });

    it('lọc thì đưa từ khóa và trạng thái vào truy vấn, đặt lại trang 1', () => {
      taoTrang();
      noiBo()['page'].set(3);
      noiBo()['keyword'] = 'GATE';
      noiBo()['statusFilter'] = 'LOCKED';
      api.getCatalogItems.calls.reset();

      component['applyFilters']();

      expect(api.getCatalogItems).toHaveBeenCalledWith('gates', {
        keyword: 'GATE',
        status: 'LOCKED',
        page: 1,
        pageSize: 10,
      });
    });

    it('không tải được danh mục thì báo lỗi', () => {
      api.getCatalogItems.and.returnValue(throwError(() => ({ status: 500 })));
      taoTrang();

      expect(noiDungTrang()).toContain('Không tải được danh mục. Vui lòng thử lại.');
    });
  });

  // ---------------------------------------------------------------------------
  // BUG-072: ô tìm mục lọc ngay khi gõ (debounce nhẹ), không cần bấm Enter.
  describe('Ô tìm mục lọc khi gõ (BUG-072)', () => {
    it('gõ vào ô tìm mục sẽ lọc sau debounce, không cần Enter', fakeAsync(() => {
      taoTrang();
      api.getCatalogItems.calls.reset();

      component['onKeywordInput']('GATE');
      expect(api.getCatalogItems).not.toHaveBeenCalled(); // chưa gọi ngay từng phím

      tick(300);
      expect(api.getCatalogItems).toHaveBeenCalledWith('gates', {
        keyword: 'GATE',
        status: '',
        page: 1,
        pageSize: 10,
      });
    }));

    it('nhiều lần gõ liên tiếp chỉ gọi API một lần sau khi ngừng gõ', fakeAsync(() => {
      taoTrang();
      api.getCatalogItems.calls.reset();

      component['onKeywordInput']('G');
      tick(100);
      component['onKeywordInput']('GA');
      tick(100);
      component['onKeywordInput']('GAT');
      tick(300);

      expect(api.getCatalogItems).toHaveBeenCalledTimes(1);
      expect(api.getCatalogItems).toHaveBeenCalledWith('gates', {
        keyword: 'GAT',
        status: '',
        page: 1,
        pageSize: 10,
      });
    }));
  });

  // ---------------------------------------------------------------------------
  // BUG-073: phân biệt "danh mục rỗng thật" với "lọc không khớp".
  describe('Trạng thái rỗng phân biệt theo bộ lọc (BUG-073)', () => {
    it('danh mục rỗng chưa lọc hiện "Chưa có mục nào..."', () => {
      api.getCatalogItems.and.returnValue(of(trang([])));
      taoTrang();

      expect(component['hasItemFilters']()).toBeFalse();
      expect(noiDungTrang()).toContain('Chưa có mục nào trong danh mục này.');
      expect(noiDungTrang()).not.toContain('Không có mục nào khớp bộ lọc.');
    });

    it('lọc không khớp hiện "Không có mục nào khớp bộ lọc."', () => {
      api.getCatalogItems.and.returnValue(of(trang([])));
      taoTrang();

      noiBo()['keyword'] = 'ZZZ';
      component['applyFilters']();
      fixture.detectChanges();

      expect(component['hasItemFilters']()).toBeTrue();
      expect(noiDungTrang()).toContain('Không có mục nào khớp bộ lọc.');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Thêm mục — chặn thiếu dữ liệu ngay ở web', () => {
    it('thiếu cả mã và tên thì không gọi API, báo lỗi tại chỗ', () => {
      taoTrang();
      component['openAdd']();
      noiBo()['formCode'] = '';
      noiBo()['formName'] = '';

      component['submitItem']();

      expect(api.createCatalogItem).not.toHaveBeenCalled();
      expect(noiBo()['formCodeError']()).toBe('Vui lòng nhập mã và tên.');
    });

    it('có mã nhưng thiếu tên vẫn bị chặn', () => {
      taoTrang();
      component['openAdd']();
      noiBo()['formCode'] = 'GATE_C';
      noiBo()['formName'] = '   ';
      noiBo()['formSort'] = 1;

      component['submitItem']();

      expect(api.createCatalogItem).not.toHaveBeenCalled();
      expect(noiBo()['formNameError']()).toBe('Vui lòng nhập mã và tên.');
    });

    it('để trống thứ tự sắp xếp thì báo lỗi "Vui lòng nhập thứ tự sắp xếp"', () => {
      taoTrang();
      component['openAdd']();
      noiBo()['formCode'] = 'GATE_C';
      noiBo()['formName'] = 'Cổng C';
      noiBo()['formSort'] = '';

      component['submitItem']();

      expect(api.createCatalogItem).not.toHaveBeenCalled();
      expect(noiBo()['formSortError']()).toBe('Vui lòng nhập thứ tự sắp xếp.');
    });

    it('nhập thứ tự sắp xếp là 0 thì báo lỗi "Thứ tự phải là số nguyên khác 0"', () => {
      taoTrang();
      component['openAdd']();
      noiBo()['formCode'] = 'GATE_C';
      noiBo()['formName'] = 'Cổng C';
      noiBo()['formSort'] = 0;

      component['submitItem']();

      expect(api.createCatalogItem).not.toHaveBeenCalled();
      expect(noiBo()['formSortError']()).toBe('Thứ tự phải là số nguyên khác 0.');
    });

    it('chặn nhập chữ, khoảng trắng và ký tự đặc biệt (!@#$%) từ bàn phím khi gõ ô thứ tự', () => {
      taoTrang();
      const eventLetter = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
      const spyLetter = spyOn(eventLetter, 'preventDefault');
      component['onSortKeyDown'](eventLetter);
      expect(spyLetter).toHaveBeenCalled();

      const eventSpace = new KeyboardEvent('keydown', { key: ' ', cancelable: true });
      const spySpace = spyOn(eventSpace, 'preventDefault');
      component['onSortKeyDown'](eventSpace);
      expect(spySpace).toHaveBeenCalled();

      const eventExclamation = new KeyboardEvent('keydown', { key: '!', cancelable: true });
      const spyExclamation = spyOn(eventExclamation, 'preventDefault');
      component['onSortKeyDown'](eventExclamation);
      expect(spyExclamation).toHaveBeenCalled();

      const eventShiftDigit = new KeyboardEvent('keydown', { key: '1', shiftKey: true, cancelable: true });
      const spyShiftDigit = spyOn(eventShiftDigit, 'preventDefault');
      component['onSortKeyDown'](eventShiftDigit);
      expect(spyShiftDigit).toHaveBeenCalled();

      const eventDigit = new KeyboardEvent('keydown', { key: '5', cancelable: true });
      const spyDigit = spyOn(eventDigit, 'preventDefault');
      component['onSortKeyDown'](eventDigit);
      expect(spyDigit).not.toHaveBeenCalled();
    });

    it('đủ mã và tên thì gửi đúng nhóm và payload', () => {
      taoTrang();
      component['openAdd']();
      noiBo()['formCode'] = 'GATE_C';
      noiBo()['formName'] = 'Cổng C';
      noiBo()['formSort'] = 3;

      component['submitItem']();

      expect(api.createCatalogItem).toHaveBeenCalledWith('gates', {
        code: 'GATE_C',
        name: 'Cổng C',
        sortOrder: 3,
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('Sửa mục — mục đã khóa không cho sửa', () => {
    it('sửa mục đang dùng thì mở hộp thoại với mã chỉ đọc', () => {
      taoTrang();

      component['openEdit'](muc());

      expect(noiBo()['itemModal']()?.mode).toBe('edit');
      expect(noiBo()['formCode']).toBe('GATE_A');
    });

    it('sửa mục đã khóa thì không mở hộp thoại, nhắc mở khóa trước', () => {
      taoTrang();

      component['openEdit'](muc({ status: 'LOCKED' }));

      expect(noiBo()['itemModal']()).toBeNull();
      expect(coToast('warning', 'Mục đã khóa — không thể sửa. Mở khóa trước nếu cần.')).toBe(true);
    });

    it('cập nhật gửi tên và thứ tự, không gửi mã', () => {
      taoTrang();
      component['openEdit'](muc());
      noiBo()['formName'] = 'Cổng A1';
      noiBo()['formSort'] = 5;

      component['submitItem']();

      expect(api.updateCatalogItem).toHaveBeenCalledWith('gates', 'i-1', {
        name: 'Cổng A1',
        sortOrder: 5,
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('Khóa / mở khóa — chỉ khóa, không xóa vật lý', () => {
    it('khóa phải qua bước xác nhận trước khi gọi API', () => {
      taoTrang();

      component['askLock'](muc());

      expect(noiBo()['lockTarget']()?.id).toBe('i-1');
      expect(api.lockCatalogItem).not.toHaveBeenCalled();

      component['submitLock']();

      expect(api.lockCatalogItem).toHaveBeenCalledWith('gates', 'i-1');
      expect(noiBo()['lockTarget']()).toBeNull();
    });

    it('nhóm mặc định KHÔNG hiện nút khóa; nhóm thường thì có', () => {
      taoTrang();
      const bieuTuongThaoTac = (): string[] =>
        Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.grid__actions mat-icon')).map(
          (el) => el.textContent?.trim() || '',
        );

      // Mặc định chọn nhóm 'gates' (isSystem) → mục ACTIVE không có nút khóa.
      expect(component['selectedType']()?.isSystem).toBeTrue();
      expect(bieuTuongThaoTac()).not.toContain('lock');

      // Chọn nhóm thường 'cargo_types' → nút khóa xuất hiện lại cho mục ACTIVE.
      component['selectType'](dsNhom[1]);
      fixture.detectChanges();
      expect(bieuTuongThaoTac()).toContain('lock');
    });

    it('mở khóa gọi thẳng API, không cần xác nhận', () => {
      taoTrang();

      component['unlock'](muc({ id: 'i-2', code: 'GATE_B', status: 'LOCKED' }));

      expect(api.unlockCatalogItem).toHaveBeenCalledWith('gates', 'i-2');
    });

    it('không có quyền catalog.delete thì không hiện nút xóa nào', () => {
      taoTrang();

      const bieuTuong = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('mat-icon'),
      ).map((el) => el.textContent?.trim() || '');
      expect(bieuTuong).not.toContain('delete');
    });
  });

  // ---------------------------------------------------------------------------
  // BUG-058: xóa mục/nhóm có rào (đã được chủ dự án duyệt). Chỉ mục ACTIVE của nhóm KHÔNG mặc định
  // và nhóm admin tự thêm & rỗng mới xóa được; còn lại chỉ khóa (BE cũng chặn 400).
  describe('Xóa mục/nhóm có rào (BUG-058)', () => {
    const quyenXoa = ['catalog.view', 'catalog.create', 'catalog.update', 'catalog.delete'];

    function bieuTuongThaoTacMuc(): string[] {
      return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.grid__actions mat-icon')).map(
        (el) => el.textContent?.trim() || '',
      );
    }

    it('nhóm mặc định (isSystem) KHÔNG hiện nút xóa mục', () => {
      taoTrang(quyenXoa);
      // Mặc định chọn nhóm 'gates' (isSystem).
      expect(component['selectedType']()?.isSystem).toBeTrue();
      expect(bieuTuongThaoTacMuc()).not.toContain('delete');
    });

    it('nhóm thường: mục ACTIVE có nút xóa, mục đã khóa thì không', () => {
      taoTrang(quyenXoa);
      component['selectType'](dsNhom[1]);
      fixture.detectChanges();

      // GATE_A (ACTIVE) → xóa được; GATE_B (LOCKED) → chỉ có mở khóa, không có xóa.
      expect(component['canDeleteItem'](muc())).toBeTrue();
      expect(component['canDeleteItem'](muc({ status: 'LOCKED' }))).toBeFalse();
      expect(bieuTuongThaoTacMuc()).toContain('delete');
    });

    it('xóa mục phải qua bước xác nhận rồi mới gọi API', () => {
      taoTrang(quyenXoa);
      component['selectType'](dsNhom[1]);

      component['askDeleteItem'](muc());
      expect(noiBo()['deleteItemTarget']()?.id).toBe('i-1');
      expect(api.deleteCatalogItem).not.toHaveBeenCalled();

      component['submitDeleteItem']();
      expect(api.deleteCatalogItem).toHaveBeenCalledWith('cargo_types', 'i-1');
      expect(noiBo()['deleteItemTarget']()).toBeNull();
      expect(coToast('success', 'Đã xóa mục danh mục.')).toBe(true);
    });

    it('xóa mục bị BE chặn (400) thì hiện lỗi, không nuốt im', () => {
      api.deleteCatalogItem.and.returnValue(
        throwError(() => ({ error: { message: 'Chỉ được xóa mục do quản trị viên tự thêm và chưa phát sinh dữ liệu.' } })),
      );
      taoTrang(quyenXoa);
      component['selectType'](dsNhom[1]);

      component['askDeleteItem'](muc());
      component['submitDeleteItem']();

      expect(coToast('error', 'Chỉ được xóa mục do quản trị viên tự thêm và chưa phát sinh dữ liệu.')).toBe(true);
    });

    it('nhóm mặc định không hiện nút xóa nhóm; nhóm thường thì có', () => {
      taoTrang(quyenXoa);
      const nutXoaNhom = (): number =>
        (fixture.nativeElement as HTMLElement).querySelectorAll('.type-edit--danger').length;
      // dsNhom có 1 nhóm hệ thống (gates) + 1 nhóm thường (cargo_types) → đúng 1 nút xóa nhóm.
      expect(nutXoaNhom()).toBe(1);
    });

    it('nhóm rỗng: xóa nhóm qua xác nhận rồi gọi API', () => {
      taoTrang(quyenXoa);
      const nhomRong = nhom({ id: 't-2', code: 'cargo_types', itemCount: 0 });

      component['askDeleteType'](nhomRong);
      expect(noiBo()['deleteTypeTarget']()?.id).toBe('t-2');
      expect(api.deleteCatalogType).not.toHaveBeenCalled();

      component['submitDeleteType']();
      expect(api.deleteCatalogType).toHaveBeenCalledWith('cargo_types');
      expect(coToast('success', 'Đã xóa nhóm danh mục.')).toBe(true);
    });

    it('nhóm CÒN mục thì chặn ngay ở web, không mở xác nhận', () => {
      taoTrang(quyenXoa);
      component['askDeleteType'](nhom({ code: 'cargo_types', itemCount: 7 }));

      expect(noiBo()['deleteTypeTarget']()).toBeNull();
      expect(coToast('warning', 'Nhóm còn mục bên trong nên không xóa được. Hãy xóa hết mục trước.')).toBe(true);
      expect(api.deleteCatalogType).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // BUG-014: mọi lỗi API khi khóa/mở khóa/thêm/sửa mục phải HIỆN ra, không nuốt im.
  describe('Lỗi API không bị nuốt', () => {
    // BE chặn khóa mục thuộc nhóm mặc định (isSystem) → 400 catalog.lockSystemForbidden.
    const loiKhoaHeThong = {
      error: { message: 'Không thể khóa mục thuộc nhóm danh mục mặc định.', messageKey: 'catalog.lockSystemForbidden' },
    };

    it('khóa mục lỗi thì hiện thông báo lỗi (không nuốt im)', () => {
      api.lockCatalogItem.and.returnValue(throwError(() => loiKhoaHeThong));
      taoTrang();

      component['askLock'](muc());
      component['submitLock']();

      expect(noiBo()['lockTarget']()).toBeNull();
      expect(coToast('error', 'Không thể khóa mục thuộc nhóm danh mục mặc định.')).toBe(true);
    });

    it('mở khóa mục lỗi thì hiện thông báo lỗi', () => {
      api.unlockCatalogItem.and.returnValue(throwError(() => ({ error: { message: 'Không mở khóa được mục.' } })));
      taoTrang();

      component['unlock'](muc({ id: 'i-2', status: 'LOCKED' }));

      expect(coToast('error', 'Không mở khóa được mục.')).toBe(true);
    });

    it('thêm mục lỗi thì hiện lỗi trong hộp thoại', () => {
      api.createCatalogItem.and.returnValue(throwError(() => ({ error: { message: 'Không thể thêm mục.' } })));
      taoTrang();
      component['openAdd']();
      noiBo()['formCode'] = 'GATE_C';
      noiBo()['formName'] = 'Cổng C';
      noiBo()['formSort'] = 1;

      component['submitItem']();

      expect(noiBo()['formError']()).toBe('Không thể thêm mục.');
    });

    it('thêm mục trùng thứ tự sắp xếp thì hiện lỗi ngay tại trường thứ tự sắp xếp', () => {
      api.createCatalogItem.and.returnValue(
        throwError(() => ({
          error: {
            messageKey: 'catalog.itemSortOrderDuplicated',
            message: 'Thứ tự sắp xếp đã tồn tại.',
            errors: [{ field: 'sortOrder', message: 'Thứ tự sắp xếp đã tồn tại.', messageKey: 'catalog.itemSortOrderDuplicated' }],
          },
        })),
      );
      taoTrang();
      component['openAdd']();
      noiBo()['formCode'] = 'GATE_C';
      noiBo()['formName'] = 'Cổng C';
      noiBo()['formSort'] = 1;

      component['submitItem']();
      fixture.detectChanges();

      expect(noiBo()['formSortError']()).toBe('Thứ tự sắp xếp đã tồn tại.');
      expect(noiBo()['formError']()).toBe('');
      expect(noiDungTrang()).toContain('Thứ tự sắp xếp đã tồn tại.');
    });

    it('sửa mục trùng thứ tự sắp xếp thì hiện lỗi ngay tại trường thứ tự sắp xếp', () => {
      api.updateCatalogItem.and.returnValue(
        throwError(() => ({
          error: {
            messageKey: 'catalog.itemSortOrderDuplicated',
            message: 'Thứ tự sắp xếp đã tồn tại.',
          },
        })),
      );
      taoTrang();
      component['openEdit'](muc());
      noiBo()['formSort'] = 2;

      component['submitItem']();
      fixture.detectChanges();

      expect(noiBo()['formSortError']()).toBe('Thứ tự sắp xếp đã tồn tại.');
      expect(noiBo()['formError']()).toBe('');
      expect(noiDungTrang()).toContain('Thứ tự sắp xếp đã tồn tại.');
    });

    it('sửa mục lỗi chung thì hiện lỗi trong hộp thoại', () => {
      api.updateCatalogItem.and.returnValue(throwError(() => ({ error: { message: 'Không cập nhật được mục.' } })));
      taoTrang();
      component['openEdit'](muc());
      noiBo()['formName'] = 'Cổng A1';

      component['submitItem']();

      expect(noiBo()['formError']()).toBe('Không cập nhật được mục.');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Panel trái — mô tả nhóm và badge đếm số mục', () => {
    it('hiện mô tả của nhóm khi có dữ liệu', () => {
      taoTrang();

      expect(noiDungTrang()).toContain('Các cổng kiểm soát vật lý tại cửa khẩu');
    });

    it('hiện badge đếm số mục theo itemCount của từng nhóm', () => {
      taoTrang();
      const badges = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.type-item__count'),
      ).map((el) => el.textContent?.trim());

      expect(badges).toContain('4');
      expect(badges).toContain('7');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Nhóm danh mục — thêm/sửa (không khóa/xóa nhóm)', () => {
    it('cho phép nhập mã 64 ký tự và tên nhóm 160 ký tự theo contract API', () => {
      taoTrang();
      component['openAddType']();
      fixture.detectChanges();

      const codeInput = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[name="typeCode"]');
      const nameInput = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('.item-form input')[1];

      expect(codeInput?.maxLength).toBe(64);
      expect(nameInput?.maxLength).toBe(160);
    });

    it('thêm nhóm thiếu mã hoặc tên thì chặn ngay, không gọi API', () => {
      taoTrang();
      component['openAddType']();
      noiBo()['formTypeCode'] = '';
      noiBo()['formTypeName'] = 'Hình thức thanh toán';

      component['submitType']();

      expect(api.createCatalogType).not.toHaveBeenCalled();
      expect(noiBo()['formTypeError']()).toBe('Vui lòng nhập mã và tên nhóm.');
    });

    it('thêm nhóm đủ mã và tên thì gửi đúng payload', () => {
      taoTrang();
      component['openAddType']();
      noiBo()['formTypeCode'] = 'payment_methods';
      noiBo()['formTypeName'] = 'Hình thức thanh toán';
      noiBo()['formTypeDesc'] = 'Cách thanh toán phí';

      component['submitType']();

      const payload: CatalogTypePayload = {
        code: 'payment_methods',
        name: 'Hình thức thanh toán',
        description: 'Cách thanh toán phí',
      };
      expect(api.createCatalogType).toHaveBeenCalledWith(payload);
    });

    it('sửa nhóm gửi tên và mô tả, không gửi mã (mã cố định)', () => {
      taoTrang();
      component['openEditType'](dsNhom[1]);
      expect(noiBo()['typeModal']()?.mode).toBe('edit');
      expect(noiBo()['formTypeCode']).toBe('cargo_types');
      noiBo()['formTypeName'] = 'Loại hàng hóa';
      noiBo()['formTypeDesc'] = '';

      component['submitType']();

      expect(api.updateCatalogType).toHaveBeenCalledWith('cargo_types', {
        name: 'Loại hàng hóa',
        description: null,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // BUG-041: mỗi thao tác thành công phải có toast thành công (nhất quán với màn Người dùng).
  describe('Phản hồi thành công (BUG-041)', () => {
    function mongDoiToastThanhCong(text: string): void {
      expect(coToast('success', text)).toBe(true);
    }

    it('thêm nhóm thành công báo "Đã thêm nhóm danh mục."', () => {
      taoTrang();
      component['openAddType']();
      noiBo()['formTypeCode'] = 'payment_methods';
      noiBo()['formTypeName'] = 'Hình thức thanh toán';

      component['submitType']();

      mongDoiToastThanhCong('Đã thêm nhóm danh mục.');
    });

    it('sửa nhóm thành công báo "Đã cập nhật nhóm danh mục."', () => {
      taoTrang();
      component['openEditType'](dsNhom[1]);
      noiBo()['formTypeName'] = 'Loại hàng hóa';

      component['submitType']();

      mongDoiToastThanhCong('Đã cập nhật nhóm danh mục.');
    });

    it('thêm mục thành công báo "Đã thêm mục danh mục."', () => {
      taoTrang();
      component['openAdd']();
      noiBo()['formCode'] = 'GATE_C';
      noiBo()['formName'] = 'Cổng C';
      noiBo()['formSort'] = 1;

      component['submitItem']();

      mongDoiToastThanhCong('Đã thêm mục danh mục.');
    });

    it('sửa mục thành công báo "Đã cập nhật mục danh mục."', () => {
      taoTrang();
      component['openEdit'](muc());
      noiBo()['formName'] = 'Cổng A1';

      component['submitItem']();

      mongDoiToastThanhCong('Đã cập nhật mục danh mục.');
    });

    it('khóa mục thành công báo "Đã khóa mục danh mục."', () => {
      taoTrang();
      component['askLock'](muc());
      component['submitLock']();

      mongDoiToastThanhCong('Đã khóa mục danh mục.');
    });

    it('mở khóa mục thành công báo "Đã mở khóa mục danh mục."', () => {
      taoTrang();
      component['unlock'](muc({ id: 'i-2', code: 'GATE_B', status: 'LOCKED' }));

      mongDoiToastThanhCong('Đã mở khóa mục danh mục.');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Phân trang mục danh mục (mặc định 10 mục/trang, thông tin phân trang & đổi số dòng/trang)', () => {
    it('mặc định hiển thị 10 mục/trang và nạp trang 1', () => {
      taoTrang();

      expect(component['pageSize']()).toBe(10);
      expect(component['page']()).toBe(1);
    });

    it('hiển thị thông tin phân trang theo thiết kế khi có dữ liệu', () => {
      api.getCatalogItems.and.returnValue(of(trang(dsMuc, 25, 1, 10)));
      taoTrang();

      expect(component['summary']()).toBe('Hiển thị 1 đến 10 trong tổng số 25 mục');
      expect(noiDungTrang()).toContain('Hiển thị 1 đến 10 trong tổng số 25 mục');
      expect(noiDungTrang()).toContain('Hiển thị');
    });

    it('hiển thị thông tin phân trang khi danh sách rỗng (0 mục)', () => {
      api.getCatalogItems.and.returnValue(of(trang([], 0, 1, 10)));
      taoTrang();

      expect(component['summary']()).toBe('0 mục');
      expect(noiDungTrang()).toContain('0 mục');
    });

    it('đổi kích thước trang (pageSize) thì nạp lại từ trang 1 với pageSize mới', () => {
      taoTrang();
      api.getCatalogItems.calls.reset();

      component['changePageSize']('20');

      expect(component['pageSize']()).toBe(20);
      expect(component['page']()).toBe(1);
      expect(api.getCatalogItems).toHaveBeenCalledWith('gates', {
        keyword: '',
        status: '',
        page: 1,
        pageSize: 20,
      });
    });

    it('chuyển trang qua goToPage gọi API với đúng số trang', () => {
      api.getCatalogItems.and.returnValue(of(trang(dsMuc, 25, 1, 10)));
      taoTrang();
      api.getCatalogItems.calls.reset();

      component['goToPage'](2);

      expect(component['page']()).toBe(2);
      expect(api.getCatalogItems).toHaveBeenCalledWith('gates', {
        keyword: '',
        status: '',
        page: 2,
        pageSize: 10,
      });
    });

    it('SG-250: cấu trúc DOM chứa container .catalog-layout, .type-list và .catalog-items cân đối', () => {
      taoTrang();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.catalog-layout')).not.toBeNull();
      expect(el.querySelector('.catalog-types')).not.toBeNull();
      expect(el.querySelector('.type-list')).not.toBeNull();
      expect(el.querySelector('.catalog-items')).not.toBeNull();
    });
  });

  describe('Cấu hình trường hồ sơ (openConfigDrawer)', () => {
    it('suy diễn legacyVisible = false khi tất cả trường legacy đang ẩn', () => {
      api.getDossierFieldConfigs = jasmine.createSpy('getDossierFieldConfigs').and.returnValue(
        of([
          { fieldKey: 'enterpriseTaxCode', fieldName: 'MST', isVisible: false, isRequired: false },
          { fieldKey: 'enterpriseName', fieldName: 'Tên', isVisible: false, isRequired: false },
        ]),
      );
      taoTrang();
      noiBo()['openConfigDrawer'](muc());

      const configs = component['fieldConfigs']();
      const accountInfo = configs.find((c) => c.fieldKey === 'accountInfo');
      expect(accountInfo).toBeTruthy();
      expect(accountInfo?.isVisible).toBeFalse();
    });
  });

  describe('Đa ngôn ngữ danh mục (typeName, typeDescription, itemName)', () => {
    afterEach(() => {
      try {
        const i18n = TestBed.inject(I18nService);
        i18n.setLocale('vi');
      } catch {
        // Ignore if testbed not instantiated
      }
    });

    it('dịch tên nhóm danh mục chính xác theo ngôn ngữ (VI giữ tên DB, EN dịch theo map)', () => {
      taoTrang();
      const i18n = TestBed.inject(I18nService);
      i18n.setLocale('vi');

      const typeDossier: CatalogType = { id: 't-d', code: 'DOSSIER_TYPE', name: 'Loại hình hồ sơ', description: null, isSystem: true, sortOrder: 1, itemCount: 5 };
      const typeRevoke: CatalogType = { id: 't-r', code: 'REASON_REVOKE', name: 'Mã nguyên nhân - thu hồi xác nhận', description: null, isSystem: true, sortOrder: 2, itemCount: 3 };
      const typeChecklist: CatalogType = { id: 't-c', code: 'GATE_CHECKLIST', name: 'Checklist điều kiện qua cổng', description: null, isSystem: true, sortOrder: 3, itemCount: 3 };
      const typeRequiredDoc: CatalogType = { id: 't-rd', code: 'REQUIRED_DOCUMENT', name: 'Chứng từ bắt buộc theo loại hồ sơ', description: null, isSystem: true, sortOrder: 4, itemCount: 6 };
      const typeDoc: CatalogType = { id: 't-doc', code: 'DOCUMENT_TYPE', name: 'Loại chứng từ', description: null, isSystem: true, sortOrder: 5, itemCount: 10 };
      const typeGateLane: CatalogType = { id: 't-gl', code: 'GATE_LANE', name: 'Làn qua cổng', description: null, isSystem: true, sortOrder: 6, itemCount: 8 };
      const typeYardZone: CatalogType = { id: 't-yz', code: 'YARD_ZONE', name: 'Phân khu bãi đỗ', description: null, isSystem: true, sortOrder: 7, itemCount: 4 };
      const typeCustom: CatalogType = { id: 't-custom', code: 'CUSTOM_TYPE', name: 'Tên nhóm do Admin sửa', description: null, isSystem: false, sortOrder: 8, itemCount: 0 };

      // Tiếng Việt: Giữ nguyên tên từ DB (kể cả khi admin sửa tên)
      expect(component['typeName'](typeDossier)).toBe('Loại hình hồ sơ');
      expect(component['typeName'](typeRevoke)).toBe('Mã nguyên nhân - thu hồi xác nhận');
      expect(component['typeName'](typeChecklist)).toBe('Checklist điều kiện qua cổng');
      expect(component['typeName'](typeRequiredDoc)).toBe('Chứng từ bắt buộc theo loại hồ sơ');
      expect(component['typeName'](typeDoc)).toBe('Loại chứng từ');
      expect(component['typeName'](typeGateLane)).toBe('Làn qua cổng');
      expect(component['typeName'](typeYardZone)).toBe('Phân khu bãi đỗ');
      expect(component['typeName'](typeCustom)).toBe('Tên nhóm do Admin sửa');

      // Tiếng Anh
      i18n.setLocale('en');
      expect(component['typeName'](typeDossier)).toBe('Declaration Types');
      expect(component['typeName'](typeRevoke)).toBe('Revocation Reasons');
      expect(component['typeName'](typeChecklist)).toBe('Gate Clearance Checklist');
      expect(component['typeName'](typeRequiredDoc)).toBe('Required Documents by Dossier Type');
      expect(component['typeName'](typeDoc)).toBe('Document Types');
      expect(component['typeName'](typeGateLane)).toBe('Gate Lanes');
      expect(component['typeName'](typeYardZone)).toBe('Yard Zones');
      expect(component['typeName'](typeCustom)).toBe('Tên nhóm do Admin sửa');
    });

    it('dịch mô tả nhóm danh mục chính xác và bảo toàn metadata (VI giữ nguyên DB, EN dịch map)', () => {
      taoTrang();
      const i18n = TestBed.inject(I18nService);

      const descGateWithMeta = 'Mục đối chiếu thủ công tại cổng (F39, UI-09). metadata.required = bắt buộc tích thì mới xác nhận cho qua cổng được.';
      const descCustom = 'Mô tả nhóm tuỳ biến do admin thêm mới.';

      // Tiếng Việt
      i18n.setLocale('vi');
      expect(component['typeDescription'](descGateWithMeta, 'GATE_CHECKLIST')).toBe(descGateWithMeta);
      expect(component['typeDescription'](descCustom, 'CUSTOM_TYPE')).toBe(descCustom);

      // Tiếng Anh
      i18n.setLocale('en');
      expect(component['typeDescription'](descGateWithMeta, 'GATE_CHECKLIST')).toBe(
        'Manual cross-check items at gate (F39, UI-09). metadata.required = bắt buộc tích thì mới xác nhận cho qua cổng được.'
      );
      expect(component['typeDescription']('Lý do từ chối thu phí', 'FEE_REJECTION')).toBe('Fee rejection reasons.');
      expect(component['typeDescription'](descCustom, 'CUSTOM_TYPE')).toBe(descCustom);
    });

    it('dịch tên mục danh mục theo typeCode (scoped mapping) và hiển thị subtitle đúng', () => {
      taoTrang();
      const i18n = TestBed.inject(I18nService);

      const typeGateChecklist: CatalogType = {
        id: 't-gc',
        code: 'GATE_CHECKLIST',
        name: 'Checklist điều kiện qua cổng',
        description: 'Mục đối chiếu thủ công tại cổng (F39, UI-09). metadata.required = bắt buộc tích thì mới xác nhận cho qua cổng được.',
        isSystem: true,
        sortOrder: 1,
        itemCount: 8,
      };

      const typeYardZone: CatalogType = {
        id: 't-yz',
        code: 'YARD_ZONE',
        name: 'Phân khu bãi đỗ',
        description: 'Khu bãi và số ô đỗ (F42). metadata.capacity = sức chứa.',
        isSystem: true,
        sortOrder: 2,
        itemCount: 4,
      };

      const itemYardA: CatalogItem = muc({ typeCode: 'YARD_ZONE', code: 'A', name: 'Kho ngoại quan' });
      const itemYardB: CatalogItem = muc({ typeCode: 'YARD_ZONE', code: 'B', name: 'Bãi container' });
      const itemYardC: CatalogItem = muc({ typeCode: 'YARD_ZONE', code: 'C', name: 'Kho nông sản' });
      const itemYardD: CatalogItem = muc({ typeCode: 'YARD_ZONE', code: 'D', name: 'Bãi xe chờ' });
      const itemCustom: CatalogItem = muc({ typeCode: 'CUSTOM_TYPE', code: 'CUSTOM_01', name: 'Mục tuỳ chỉnh' });

      // 1. Tiếng Việt
      i18n.setLocale('vi');
      component['selectedType'].set(typeGateChecklist);
      expect(component['selectedTypeSubtitle']()).toContain('Checklist điều kiện qua cổng');
      expect(component['selectedTypeSubtitle']()).toContain('metadata.required');

      expect(component['itemName'](itemYardA)).toBe('Kho ngoại quan');
      expect(component['itemName'](itemYardB)).toBe('Bãi container');
      expect(component['itemName'](itemYardC)).toBe('Kho nông sản');
      expect(component['itemName'](itemYardD)).toBe('Bãi xe chờ');
      expect(component['itemName'](itemCustom)).toBe('Mục tuỳ chỉnh');

      // 2. Tiếng Anh
      i18n.setLocale('en');
      component['selectedType'].set(typeGateChecklist);
      expect(component['selectedTypeSubtitle']()).toBe(
        'Gate Clearance Checklist — Manual cross-check items at gate (F39, UI-09). metadata.required = bắt buộc tích thì mới xác nhận cho qua cổng được.'
      );

      component['selectedType'].set(typeYardZone);
      expect(component['selectedTypeSubtitle']()).toBe(
        'Yard Zones — Yard areas and parking slot capacities (F42). metadata.capacity = sức chứa.'
      );

      expect(component['itemName'](itemYardA)).toBe('Bonded Warehouse');
      expect(component['itemName'](itemYardB)).toBe('Container Yard');
      expect(component['itemName'](itemYardC)).toBe('Agricultural Storehouse');
      expect(component['itemName'](itemYardD)).toBe('Waiting Vehicle Yard');
      expect(component['itemName'](itemCustom)).toBe('Mục tuỳ chỉnh');
    });
  });
});
