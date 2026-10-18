import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccessProfile } from '../../../core/auth/access-control.model';
import { SESSION_STORAGE_KEY } from '../../../core/auth/session.storage';
import { AdminUser, ApiService, Paged, RoleSummary } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { AdminUsersPageComponent } from './admin-users-page.component';

/**
 * UI-13 Quản trị người dùng — phần được GIỮ LẠI sau khi tách F03 (quản lý vai trò & ma trận phân
 * quyền chuyển sang `RoleManagementPageComponent`). Test ở đây phủ nạp dữ liệu ban đầu, gán vai trò
 * cho người dùng, lưu và xóa tài khoản. Các case về ma trận/CRUD vai trò đã chuyển sang
 * `role-management-page.component.spec.ts` (không mất độ phủ).
 */

const QUYEN_QUAN_TRI = ['system.view', 'system.create', 'system.update', 'system.delete'];

function hoSoQuanTri(): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'quantri',
      displayName: 'Quản trị hệ thống',
      title: 'Quản trị viên',
      email: 'admin@chc.gov.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: null,
    },
    roles: [{ code: 'QUAN_TRI', name: 'Quản trị hệ thống', dataScope: 'ALL' }],
    permissions: QUYEN_QUAN_TRI,
    assignments: [],
    menu: [{ key: 'admin', label: 'Quản trị', icon: 'settings', route: '/admin/users' }],
  };
}

function vaiTro(mau: Partial<RoleSummary> & Pick<RoleSummary, 'id' | 'code' | 'name'>): RoleSummary {
  return { description: '', isSystem: false, isActive: true, userCount: 0, ...mau };
}

const VAI_TRO_HE_THONG = vaiTro({ id: 'r-1', code: 'QUAN_TRI', name: 'Quản trị hệ thống', isSystem: true, userCount: 2 });
const VAI_TRO_HQ = vaiTro({ id: 'r-2', code: 'HAI_QUAN_B1', name: 'Hải quan bước 1', userCount: 5 });

function nguoiDung(mau: Partial<AdminUser> & Pick<AdminUser, 'id' | 'username'>): AdminUser {
  return {
    displayName: mau.username,
    title: '',
    email: '',
    phone: '0912345678',
    status: 'ACTIVE',
    organization: null,
    roles: [],
    ...mau,
  };
}

const NGUOI_DUNG = nguoiDung({
  id: 'u-9',
  username: 'canbo',
  displayName: 'Cán bộ A',
  email: 'canbo@chc.gov.vn',
  organization: { id: 'org-1', code: 'HQ', name: 'Chi cục Hải quan cửa khẩu' },
  roles: [{ code: 'HAI_QUAN_B1', name: 'Hải quan bước 1', dataScope: 'ORGANIZATION' }],
});

/** Tài khoản đầy đủ trường để khóa hộp xem chi tiết (liên hệ / đơn vị-vai trò / hoạt động). */
const NGUOI_DUNG_CHI_TIET = nguoiDung({
  id: 'u-7',
  username: 'lethib',
  displayName: 'Lê Thị B',
  title: 'Chuyên viên nghiệp vụ',
  email: 'lethib@chc.gov.vn',
  phone: '0911222333',
  status: 'LOCKED',
  organization: { id: 'org-1', code: 'HQ', name: 'Chi cục Hải quan cửa khẩu' },
  roles: [
    { code: 'HAI_QUAN_B1', name: 'Hải quan bước 1', dataScope: 'ORGANIZATION' },
    { code: 'HAI_QUAN_B2', name: 'Hải quan bước 2', dataScope: 'ORGANIZATION' },
  ],
  createdAt: '2026-01-15T02:00:00.000Z',
  lastLoginAt: '2026-07-20T08:30:00.000Z',
});

function trangNguoiDung(items: AdminUser[] = []): Paged<AdminUser> {
  return { items, total: items.length, page: 1, pageSize: 10 };
}

describe('AdminUsersPageComponent — quản trị người dùng và gán vai trò', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<AdminUsersPageComponent>;
  let component: AdminUsersPageComponent;

  /** Truy cập thành viên protected/private của component trong phạm vi test. */
  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function taoTrang(): void {
    fixture = TestBed.createComponent(AdminUsersPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoQuanTri() }));

    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getOrganizations',
      'getUsers',
      'getRoles',
      'createUser',
      'updateUser',
      'deleteUser',
      'approveUser',
      'lockUser',
      'unlockUser',
      'resetUserPassword',
      'setUserRoles',
    ]);
    api.getOrganizations.and.returnValue(of([]));
    api.getUsers.and.returnValue(of(trangNguoiDung([NGUOI_DUNG])));
    api.getRoles.and.returnValue(of([VAI_TRO_HE_THONG, VAI_TRO_HQ]));
    api.createUser.and.returnValue(of(NGUOI_DUNG));
    api.updateUser.and.returnValue(of(NGUOI_DUNG));
    api.deleteUser.and.returnValue(of(void 0));
    api.approveUser.and.returnValue(of(NGUOI_DUNG));
    api.lockUser.and.returnValue(of(void 0));
    api.unlockUser.and.returnValue(of(void 0));
    api.resetUserPassword.and.returnValue(of(void 0));
    api.setUserRoles.and.returnValue(of(void 0));

    TestBed.configureTestingModule({
      imports: [AdminUsersPageComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // ---------------------------------------------------------------------------
  describe('Nạp dữ liệu ban đầu', () => {
    it('nạp danh sách người dùng, đơn vị và vai trò (vai trò chỉ để lọc và gán, KHÔNG kèm ma trận)', () => {
      taoTrang();
      // 1 lần nạp danh sách + 4 lần đếm KPI (tổng/đang hoạt động/chờ duyệt/bị khóa) bằng truy vấn pageSize=1.
      expect(api.getUsers).toHaveBeenCalledTimes(5);
      expect(api.getOrganizations).toHaveBeenCalledTimes(1);
      expect(api.getRoles).toHaveBeenCalledTimes(1);
      expect(noiBo()['users']().length).toBe(1);
      expect(noiBo()['roles']().length).toBe(2);
    });

    it('không tải được danh sách người dùng thì báo lỗi và để trống bảng', () => {
      api.getUsers.and.returnValue(throwError(() => new Error('loi')));
      taoTrang();

      expect(TestBed.inject(AppMessageService).messages().some((m) => m.tone === 'error')).toBe(true);
      expect(noiBo()['users']()).toEqual([]);
      expect(noiBo()['total']()).toBe(0);
    });

    it('bộ lọc vai trò dùng danh sách vai trò làm tùy chọn', () => {
      taoTrang();
      expect(noiBo()['roleOptions']().map((option: { value: string }) => option.value)).toEqual(['r-1', 'r-2']);
    });

    it('tự động điền keyword và tìm kiếm khi có query param keyword trong route', () => {
      const activatedRoute = TestBed.inject(ActivatedRoute);
      (activatedRoute as any).queryParams = of({ keyword: 'congty.a' });
      taoTrang();

      expect(noiBo()['keyword']).toBe('congty.a');
      expect(api.getUsers).toHaveBeenCalledWith(jasmine.objectContaining({ keyword: 'congty.a' }));
    });
  });


  // ---------------------------------------------------------------------------
  describe('Loại tài khoản', () => {
    beforeEach(() => taoTrang());

    it('ánh xạ đúng nhãn và tông màu theo accountType (DN / cá nhân / nội bộ)', () => {
      const dn = nguoiDung({ id: 'a', username: 'a', accountType: 'ENTERPRISE' });
      const cn = nguoiDung({ id: 'b', username: 'b', accountType: 'INDIVIDUAL' });
      const noiBoTk = nguoiDung({ id: 'c', username: 'c' }); // accountType không khai → null

      expect(noiBo()['accountTypeLabel'](dn)).toBe('Doanh nghiệp');
      expect(noiBo()['accountTypeTone'](dn)).toBe('enterprise');
      expect(noiBo()['accountTypeLabel'](cn)).toBe('Cá nhân');
      expect(noiBo()['accountTypeTone'](cn)).toBe('individual');
      expect(noiBo()['accountTypeLabel'](noiBoTk)).toBe('Nội bộ');
      expect(noiBo()['accountTypeTone'](noiBoTk)).toBe('internal');
    });
  });

  // ---------------------------------------------------------------------------
  // DN/cá nhân có vai trò tự động theo loại; chỉ nội bộ dùng luồng gán vai trò riêng.
  describe('Khóa vai trò tài khoản DN/cá nhân', () => {
    beforeEach(() => taoTrang());

    it('isSelfRegistered đúng cho DN/cá nhân, sai cho nội bộ', () => {
      const dn = nguoiDung({ id: 'a', username: 'a', accountType: 'ENTERPRISE' });
      const cn = nguoiDung({ id: 'b', username: 'b', accountType: 'INDIVIDUAL' });
      const nb = nguoiDung({ id: 'c', username: 'c' }); // accountType null → nội bộ

      expect(noiBo()['isSelfRegistered'](dn)).toBe(true);
      expect(noiBo()['isSelfRegistered'](cn)).toBe(true);
      expect(noiBo()['isSelfRegistered'](nb)).toBe(false);
    });

    it('nút "Gán vai trò" trên dòng ẩn với DN/cá nhân, hiện với nội bộ', () => {
      const dn = nguoiDung({ id: 'u-dn', username: 'congty', accountType: 'ENTERPRISE' });
      const nb = nguoiDung({ id: 'u-nb', username: 'canbo' });
      noiBo()['users'].set([dn, nb]);
      fixture.detectChanges();

      const nutGan = fixture.nativeElement.querySelectorAll('button[title="Gán vai trò"]');
      // Chỉ tài khoản nội bộ mới có nút gán vai trò.
      expect(nutGan.length).toBe(1);
    });

    it('modal thêm/sửa hiện ghi chú tự gán vai trò theo loại và không chứa bộ chọn vai trò', () => {
      const ghiChu = 'Vai trò được tự động gán theo loại tài khoản';

      noiBo()['openUserForm']();
      noiBo()['userForm'].accountType = 'ENTERPRISE';
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain(ghiChu);
      expect(fixture.nativeElement.querySelector('.form-rolelist')).toBeNull();

      noiBo()['userForm'].accountType = '';
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain(ghiChu);
    });

    it('gán vai trò hàng loạt chỉ bật khi toàn bộ lựa chọn là tài khoản nội bộ', () => {
      const dn = nguoiDung({ id: 'u-dn', username: 'congty', accountType: 'ENTERPRISE' });
      const nb = nguoiDung({ id: 'u-nb', username: 'canbo' });
      noiBo()['users'].set([dn, nb]);

      noiBo()['selectedIds'].set(['u-nb']);
      expect(noiBo()['canAssignSelectedRoles']()).toBe(true);

      noiBo()['selectedIds'].set(['u-nb', 'u-dn']);
      expect(noiBo()['canAssignSelectedRoles']()).toBe(false);
      noiBo()['openAssignRoles']();
      expect(noiBo()['assignOpen']()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Thẻ KPI theo trạng thái (BUG-040)', () => {
    it('đếm đủ 4 trạng thái, gồm Chờ duyệt; Tổng = Hoạt động + Chờ duyệt + Bị khóa', () => {
      api.getUsers.and.callFake((params?: { status?: string }) => {
        const total =
          params?.status === 'ACTIVE' ? 27 : params?.status === 'PENDING' ? 2 : params?.status === 'LOCKED' ? 1 : 30;
        return of({ items: [], total, page: 1, pageSize: 1 });
      });
      taoTrang();

      expect(noiBo()['statsTotal']()).toBe(30);
      expect(noiBo()['statsActive']()).toBe(27);
      expect(noiBo()['statsPending']()).toBe(2);
      expect(noiBo()['statsLocked']()).toBe(1);
      expect(noiBo()['statsActive']() + noiBo()['statsPending']() + noiBo()['statsLocked']()).toBe(
        noiBo()['statsTotal'](),
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('Modal Sửa — loại tài khoản và dropdown (BUG-039, BUG-050)', () => {
    beforeEach(() => taoTrang());

    it('mở Sửa tài khoản nội bộ giữ accountType rỗng (ô hiện "Nội bộ" qua placeholder)', () => {
      noiBo()['openUserForm'](nguoiDung({ id: 'u-nb', username: 'noibo' })); // accountType null → nội bộ
      expect(noiBo()['userForm'].accountType).toBe('');
    });

    it('mở Sửa tài khoản doanh nghiệp nạp đúng accountType', () => {
      noiBo()['openUserForm'](
        nguoiDung({ id: 'u-dn', username: 'dn', accountType: 'ENTERPRISE', taxCode: '0101234567' }),
      );
      expect(noiBo()['userForm'].accountType).toBe('ENTERPRISE');
    });

    it('accountTypeFormOptions KHÔNG tự thêm mục rỗng (Nội bộ dùng placeholder, tránh nhân đôi)', () => {
      const values = noiBo()['accountTypeFormOptions']().map((option: { value: string }) => option.value);
      expect(values).toEqual(['ENTERPRISE', 'INDIVIDUAL']);
    });

    it('statusOptions KHÔNG tự thêm mục rỗng (Tất cả trạng thái dùng placeholder — khuôn BUG-050)', () => {
      const values = noiBo()['statusOptions']().map((option: { value: string }) => option.value);
      expect(values).toEqual(['ACTIVE', 'PENDING', 'LOCKED']);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Gán vai trò cho người dùng', () => {
    beforeEach(() => taoTrang());

    it('mở hộp gán vai trò từ một người dùng thì nạp sẵn vai trò hiện có', () => {
      noiBo()['openAssignRoles'](NGUOI_DUNG);

      expect(noiBo()['assignOpen']()).toBe(true);
      expect(noiBo()['selectedIds']()).toEqual(['u-9']);
      expect(noiBo()['isRoleChecked']('HAI_QUAN_B1')).toBe(true);
      expect(noiBo()['isRoleChecked']('QUAN_TRI')).toBe(false);
      expect(noiBo()['scopeOf']('HAI_QUAN_B1')).toBe('ORGANIZATION');
    });

    it('tích thêm vai trò mới gán mặc định phạm vi ALL, bỏ tích thì gỡ', () => {
      noiBo()['openAssignRoles'](NGUOI_DUNG);

      noiBo()['toggleRole']('QUAN_TRI');
      expect(noiBo()['isRoleChecked']('QUAN_TRI')).toBe(true);
      expect(noiBo()['scopeOf']('QUAN_TRI')).toBe('ALL');

      noiBo()['toggleRole']('QUAN_TRI');
      expect(noiBo()['isRoleChecked']('QUAN_TRI')).toBe(false);
    });

    it('đổi phạm vi dữ liệu của một vai trò đang chọn và lưu gửi đúng ALL (SG-261)', () => {
      noiBo()['openAssignRoles'](NGUOI_DUNG);
      noiBo()['setScope']('HAI_QUAN_B1', 'ALL');
      expect(noiBo()['scopeOf']('HAI_QUAN_B1')).toBe('ALL');

      noiBo()['confirmAssignRoles']();
      expect(api.setUserRoles).toHaveBeenCalledOnceWith('u-9', [{ roleCode: 'HAI_QUAN_B1', dataScope: 'ALL' }]);
      expect(noiBo()['assignOpen']()).toBe(false);
    });

    it('mở lại gán vai trò sau khi cập nhật phạm vi dữ liệu mới phản ánh chính xác (SG-261)', () => {
      const nguoiDungCapNhat = nguoiDung({
        id: 'u-9',
        username: 'canbo',
        roles: [{ code: 'HAI_QUAN_B1', name: 'Hải quan bước 1', dataScope: 'ALL' }],
      });

      noiBo()['openAssignRoles'](nguoiDungCapNhat);
      expect(noiBo()['assignOpen']()).toBe(true);
      expect(noiBo()['isRoleChecked']('HAI_QUAN_B1')).toBe(true);
      expect(noiBo()['scopeOf']('HAI_QUAN_B1')).toBe('ALL');
    });

    it('lưu gán vai trò gửi đúng payload cho từng người dùng đang chọn', () => {
      noiBo()['openAssignRoles'](NGUOI_DUNG);
      noiBo()['confirmAssignRoles']();

      expect(api.setUserRoles).toHaveBeenCalledOnceWith('u-9', [{ roleCode: 'HAI_QUAN_B1', dataScope: 'ORGANIZATION' }]);
      expect(noiBo()['assignOpen']()).toBe(false);
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.text === 'Đã gán vai trò cho các tài khoản đã chọn.')).toBe(true);
    });

    it('không chọn vai trò nào thì báo lỗi và không gọi API', () => {
      noiBo()['openAssignRoles'](NGUOI_DUNG);
      noiBo()['assignedRoles'].set([]);
      noiBo()['confirmAssignRoles']();

      expect(api.setUserRoles).not.toHaveBeenCalled();
      expect(noiBo()['assignError']()).toBe('Vui lòng chọn ít nhất một vai trò.');
    });

    it('gán vai trò cho tài khoản có isProtected = true thì ô tích vai trò Quản trị hệ thống bị khóa (isRoleDisabled = true) và không thể bỏ chọn', () => {
      const nguoiDungQuanTriProtected = nguoiDung({
        id: 'u-admin',
        username: 'admin',
        isProtected: true,
        roles: [{ code: 'QUAN_TRI', name: 'Quản trị hệ thống', dataScope: 'ALL' }],
      });
      noiBo()['users'].set([nguoiDungQuanTriProtected]);

      noiBo()['openAssignRoles'](nguoiDungQuanTriProtected);
      expect(noiBo()['isRoleDisabled']('QUAN_TRI')).toBe(true);

      noiBo()['toggleRole']('QUAN_TRI');
      expect(noiBo()['isRoleChecked']('QUAN_TRI')).toBe(true);
    });

    it('gán vai trò cho tài khoản không có isProtected (isProtected = false) thì ô tích vai trò Quản trị hệ thống không bị khóa và cho phép bỏ chọn', () => {
      const nguoiDungQuanTriThuong = nguoiDung({
        id: 'u-admin2',
        username: 'canbo_admin',
        isProtected: false,
        roles: [{ code: 'QUAN_TRI', name: 'Quản trị hệ thống', dataScope: 'ALL' }],
      });
      noiBo()['users'].set([nguoiDungQuanTriThuong]);

      noiBo()['openAssignRoles'](nguoiDungQuanTriThuong);
      expect(noiBo()['isRoleDisabled']('QUAN_TRI')).toBe(false);

      noiBo()['toggleRole']('QUAN_TRI');
      expect(noiBo()['isRoleChecked']('QUAN_TRI')).toBe(false);
    });

    it('dropdown Phạm vi dữ liệu chỉ gồm 3 tùy chọn (không có ASSIGNMENT - Theo phân công)', () => {
      const options = noiBo()['scopeOptions']();
      expect(options.length).toBe(3);
      expect(options.map((opt: { value: string; label: string }) => opt.value)).toEqual(['ALL', 'ORGANIZATION', 'OWN']);
    });

    it('khi gán vai trò có dataScope cũ là ASSIGNMENT thì scopeOf tự động ánh xạ hiển thị thành ORGANIZATION', () => {
      const nguoiDungLegacy = nguoiDung({
        id: 'u-legacy',
        username: 'haiquan_b1',
        roles: [{ code: 'CUSTOMS_B1', name: 'Hải quan B1', dataScope: 'ASSIGNMENT' as any }],
      });
      noiBo()['users'].set([nguoiDungLegacy]);
      noiBo()['openAssignRoles'](nguoiDungLegacy);

      expect(noiBo()['scopeOf']('CUSTOMS_B1')).toBe('ORGANIZATION');
    });

    it('khi tích chọn vai trò mới thì mặc định Phạm vi dữ liệu = ALL (Toàn hệ thống)', () => {
      noiBo()['openAssignRoles'](NGUOI_DUNG);
      noiBo()['assignedRoles'].set([]);
      noiBo()['toggleRole']('HAI_QUAN_B1');

      expect(noiBo()['scopeOf']('HAI_QUAN_B1')).toBe('ALL');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Tạo, sửa và xóa người dùng', () => {
    beforeEach(() => taoTrang());

    it('tạo người dùng mới gửi username và mật khẩu ban đầu', () => {
      noiBo()['openUserForm']();
      noiBo()['userForm'].username = 'nguyenvana';
      noiBo()['userForm'].displayName = 'Nguyễn Văn A';
      noiBo()['userForm'].email = '  nguyenvana@chc.gov.vn  ';
      noiBo()['userForm'].phone = '  0912345678  ';
      noiBo()['userForm'].organizationId = '  org-1  ';
      noiBo()['userForm'].password = 'MatKhau@123';
      noiBo()['userForm'].confirmPassword = 'MatKhau@123';
      noiBo()['saveUser']();

      expect(api.createUser).toHaveBeenCalledTimes(1);
      const payload = api.createUser.calls.mostRecent().args[0];
      expect(payload.username).toBe('nguyenvana');
      expect(payload.password).toBe('MatKhau@123');
      expect(payload.email).toBe('nguyenvana@chc.gov.vn');
      expect(payload.phone).toBe('0912345678');
      expect(payload.organizationId).toBe('org-1');
      expect(noiBo()['userFormOpen']()).toBe(false);
    });

    it('không có email thì chặn lưu và không gọi API', () => {
      noiBo()['openUserForm']();
      noiBo()['userForm'].username = 'nguyenvana';
      noiBo()['userForm'].displayName = 'Nguyễn Văn A';
      noiBo()['userForm'].phone = '0912345678';
      noiBo()['userForm'].organizationId = 'org-1';
      noiBo()['userForm'].password = 'MatKhau@123';
      noiBo()['userForm'].confirmPassword = 'MatKhau@123';
      noiBo()['saveUser']();

      expect(api.createUser).not.toHaveBeenCalled();
      expect(noiBo()['userFormErrors']()['email']).toBeTruthy();
    });

    it('email sai định dạng thì chặn lưu và không gọi API', () => {
      noiBo()['openUserForm']();
      noiBo()['userForm'].username = 'nguyenvana';
      noiBo()['userForm'].displayName = 'Nguyễn Văn A';
      noiBo()['userForm'].email = 'email-khong-hop-le';
      noiBo()['userForm'].phone = '0912345678';
      noiBo()['userForm'].organizationId = 'org-1';
      noiBo()['userForm'].password = 'MatKhau@123';
      noiBo()['userForm'].confirmPassword = 'MatKhau@123';
      noiBo()['saveUser']();

      expect(api.createUser).not.toHaveBeenCalled();
      expect(noiBo()['userFormErrors']()['email']).toBe('Địa chỉ email không hợp lệ.');
    });

    it('không có số điện thoại thì chặn lưu và không gọi API', () => {
      noiBo()['openUserForm']();
      noiBo()['userForm'].username = 'nguyenvana';
      noiBo()['userForm'].displayName = 'Nguyễn Văn A';
      noiBo()['userForm'].email = 'nguyenvana@chc.gov.vn';
      noiBo()['userForm'].phone = '';
      noiBo()['userForm'].organizationId = 'org-1';
      noiBo()['userForm'].password = 'MatKhau@123';
      noiBo()['userForm'].confirmPassword = 'MatKhau@123';
      noiBo()['saveUser']();

      expect(api.createUser).not.toHaveBeenCalled();
      expect(noiBo()['userFormErrors']()['phone']).toBeTruthy();
    });

    it('số điện thoại sai định dạng thì chặn lưu và không gọi API', () => {
      noiBo()['openUserForm']();
      noiBo()['userForm'].username = 'nguyenvana';
      noiBo()['userForm'].displayName = 'Nguyễn Văn A';
      noiBo()['userForm'].email = 'nguyenvana@chc.gov.vn';
      noiBo()['userForm'].phone = '12345';
      noiBo()['userForm'].organizationId = 'org-1';
      noiBo()['userForm'].password = 'MatKhau@123';
      noiBo()['userForm'].confirmPassword = 'MatKhau@123';
      noiBo()['saveUser']();

      expect(api.createUser).not.toHaveBeenCalled();
      expect(noiBo()['userFormErrors']()['phone']).toBe('Số điện thoại không hợp lệ.');
    });

    it('tạo người dùng với mật khẩu quá ngắn thì không gọi API', () => {
      noiBo()['openUserForm']();
      noiBo()['userForm'].username = 'nguyenvana';
      noiBo()['userForm'].displayName = 'Nguyễn Văn A';
      noiBo()['userForm'].email = 'nguyenvana@chc.gov.vn';
      noiBo()['userForm'].phone = '0912345678';
      noiBo()['userForm'].organizationId = 'org-1';
      noiBo()['userForm'].password = '123';
      noiBo()['userForm'].confirmPassword = '123';
      noiBo()['saveUser']();

      expect(api.createUser).not.toHaveBeenCalled();
      expect(noiBo()['userFormErrors']()['password']).toBeTruthy();
    });

    it('mật khẩu xác nhận không khớp thì không gọi API', () => {
      noiBo()['openUserForm']();
      noiBo()['userForm'].username = 'nguyenvana';
      noiBo()['userForm'].displayName = 'Nguyễn Văn A';
      noiBo()['userForm'].email = 'nguyenvana@chc.gov.vn';
      noiBo()['userForm'].phone = '0912345678';
      noiBo()['userForm'].organizationId = 'org-1';
      noiBo()['userForm'].password = 'MatKhau@123';
      noiBo()['userForm'].confirmPassword = 'MatKhau@999';
      noiBo()['saveUser']();

      expect(api.createUser).not.toHaveBeenCalled();
      expect(noiBo()['userFormErrors']()['confirmPassword']).toBeTruthy();
    });

    it('sửa người dùng chỉ gửi thông tin, không gửi username', () => {
      noiBo()['openUserForm'](NGUOI_DUNG);
      noiBo()['userForm'].displayName = 'Cán bộ A (sửa)';
      noiBo()['saveUser']();

      expect(api.updateUser).toHaveBeenCalledTimes(1);
      const [id, payload] = api.updateUser.calls.mostRecent().args;
      expect(id).toBe('u-9');
      expect(payload.displayName).toBe('Cán bộ A (sửa)');
      expect(api.createUser).not.toHaveBeenCalled();
    });

    it('loại nội bộ: payload gửi đơn vị, KHÔNG kèm nhóm trường DN/cá nhân', () => {
      noiBo()['openUserForm']();
      noiBo()['userForm'].username = 'canbo.noibo';
      noiBo()['userForm'].displayName = 'Cán bộ nội bộ';
      noiBo()['userForm'].email = 'canbo.noibo@chc.gov.vn';
      noiBo()['userForm'].phone = '0912345678';
      noiBo()['userForm'].password = 'MatKhau@123';
      noiBo()['userForm'].confirmPassword = 'MatKhau@123';
      noiBo()['userForm'].organizationId = 'org-1';
      noiBo()['saveUser']();

      const payload = api.createUser.calls.mostRecent().args[0] as unknown as Record<string, unknown>;
      expect(payload['organizationId']).toBe('org-1');
      expect('accountType' in payload).toBe(false);
      expect('taxCode' in payload).toBe(false);
      expect('address' in payload).toBe(false);
    });

    it('loại doanh nghiệp: payload kèm mã số thuế, người đại diện, địa chỉ; không kèm đơn vị', () => {
      noiBo()['openUserForm']();
      noiBo()['userForm'].accountType = 'ENTERPRISE';
      noiBo()['userForm'].username = 'congty.x';
      noiBo()['userForm'].displayName = 'Công ty X';
      noiBo()['userForm'].email = 'congty.x@example.com';
      noiBo()['userForm'].phone = '0912345678';
      noiBo()['userForm'].password = 'MatKhau@123';
      noiBo()['userForm'].confirmPassword = 'MatKhau@123';
      noiBo()['userForm'].taxCode = '0101234567';
      noiBo()['userForm'].representativeName = 'Nguyễn Văn A';
      noiBo()['userForm'].address = 'Số 1, đường A';
      noiBo()['saveUser']();

      const payload = api.createUser.calls.mostRecent().args[0] as unknown as Record<string, unknown>;
      expect(payload['accountType']).toBe('ENTERPRISE');
      expect(payload['taxCode']).toBe('0101234567');
      expect(payload['representativeName']).toBe('Nguyễn Văn A');
      expect(payload['address']).toBe('Số 1, đường A');
      expect('idNumber' in payload).toBe(false);
      expect('organizationId' in payload).toBe(false);
    });

    it('loại doanh nghiệp thiếu mã số thuế thì chặn, không gọi API', () => {
      noiBo()['openUserForm']();
      noiBo()['userForm'].accountType = 'ENTERPRISE';
      noiBo()['userForm'].username = 'congty.y';
      noiBo()['userForm'].displayName = 'Công ty Y';
      noiBo()['userForm'].email = 'congty.y@example.com';
      noiBo()['userForm'].phone = '0912345678';
      noiBo()['userForm'].password = 'MatKhau@123';
      noiBo()['userForm'].confirmPassword = 'MatKhau@123';
      noiBo()['saveUser']();

      expect(api.createUser).not.toHaveBeenCalled();
      expect(noiBo()['userFormErrors']()['taxCode']).toBe('Vui lòng nhập mã số thuế.');
    });

    it('loại cá nhân: payload kèm số CCCD + địa chỉ; không kèm mã số thuế/người đại diện', () => {
      noiBo()['openUserForm']();
      noiBo()['userForm'].accountType = 'INDIVIDUAL';
      noiBo()['userForm'].username = 'ca.nhan.z';
      noiBo()['userForm'].displayName = 'Nguyễn Văn Z';
      noiBo()['userForm'].email = 'ca.nhan.z@example.com';
      noiBo()['userForm'].phone = '0912345678';
      noiBo()['userForm'].password = 'MatKhau@123';
      noiBo()['userForm'].confirmPassword = 'MatKhau@123';
      noiBo()['userForm'].idNumber = '001099012345';
      noiBo()['userForm'].address = 'Số 2, đường B';
      noiBo()['saveUser']();

      const payload = api.createUser.calls.mostRecent().args[0] as unknown as Record<string, unknown>;
      expect(payload['accountType']).toBe('INDIVIDUAL');
      expect(payload['idNumber']).toBe('001099012345');
      expect(payload['address']).toBe('Số 2, đường B');
      expect('taxCode' in payload).toBe(false);
      expect('representativeName' in payload).toBe(false);
    });

    it('bấm nút xóa chỉ mở hộp xác nhận, CHƯA gọi API', () => {
      noiBo()['askDeleteUser'](NGUOI_DUNG);

      expect(noiBo()['deleteTarget']()).toBe(NGUOI_DUNG);
      expect(api.deleteUser).not.toHaveBeenCalled();
    });

    it('hủy hộp xác nhận thì không xóa', () => {
      noiBo()['askDeleteUser'](NGUOI_DUNG);
      noiBo()['deleteTarget'].set(null);

      expect(api.deleteUser).not.toHaveBeenCalled();
    });

    it('xác nhận xóa mới gọi API và tải lại danh sách', () => {
      api.getUsers.calls.reset();
      noiBo()['askDeleteUser'](NGUOI_DUNG);
      noiBo()['confirmDeleteUser']();

      expect(api.deleteUser).toHaveBeenCalledOnceWith('u-9');
      expect(api.getUsers).toHaveBeenCalled();
      expect(noiBo()['deleteTarget']()).toBeNull();
    });

    it('bulk delete only opens confirmation and does not call the API yet', () => {
      noiBo()['selectedIds'].set([NGUOI_DUNG.id]);

      noiBo()['openDeleteSelected']();

      expect(noiBo()['deleteSelectedOpen']()).toBeTrue();
      expect(api.deleteUser).not.toHaveBeenCalled();
    });

    it('cancelling bulk delete does not call the API', () => {
      noiBo()['selectedIds'].set([NGUOI_DUNG.id]);
      noiBo()['openDeleteSelected']();

      noiBo()['closeDeleteSelected']();

      expect(noiBo()['deleteSelectedOpen']()).toBeFalse();
      expect(api.deleteUser).not.toHaveBeenCalled();
    });

    it('bulk delete calls the API only after confirmation', () => {
      noiBo()['selectedIds'].set([NGUOI_DUNG.id]);
      noiBo()['openDeleteSelected']();

      noiBo()['confirmDeleteSelected']();

      expect(api.deleteUser).toHaveBeenCalledOnceWith(NGUOI_DUNG.id);
      expect(noiBo()['deleteSelectedOpen']()).toBeFalse();
    });

    it('loại nội bộ không chọn đơn vị: chặn lưu và báo lỗi', () => {
      noiBo()['openUserForm']();
      noiBo()['userForm'].username = 'canbo.trong';
      noiBo()['userForm'].displayName = 'Cán bộ trống';
      noiBo()['userForm'].email = 'canbo.trong@chc.gov.vn';
      noiBo()['userForm'].phone = '0912345678';
      noiBo()['userForm'].password = 'MatKhau@123';
      noiBo()['userForm'].confirmPassword = 'MatKhau@123';
      noiBo()['saveUser']();

      expect(api.createUser).not.toHaveBeenCalled();
      expect(noiBo()['userFormErrors']()['organizationId']).toBe('Vui lòng chọn đơn vị.');
    });

    it('lỗi lưu từ API xử lý an toàn và không gây crash', () => {
      api.createUser.and.returnValue(
        throwError(() => ({ error: { message: 'Mật khẩu phải có ít nhất một chữ hoa.' } })),
      );
      noiBo()['openUserForm']();
      noiBo()['userForm'].username = 'canbo.loi';
      noiBo()['userForm'].displayName = 'Cán bộ lỗi';
      noiBo()['userForm'].email = 'canbo.loi@chc.gov.vn';
      noiBo()['userForm'].phone = '0912345678';
      noiBo()['userForm'].organizationId = 'org-1';
      noiBo()['userForm'].password = 'MatKhau@123';
      noiBo()['userForm'].confirmPassword = 'MatKhau@123';
      noiBo()['saveUser']();

      expect(api.createUser).toHaveBeenCalledTimes(1);
      expect(noiBo()['saving']()).toBeFalse();
    });

    it('duyệt tài khoản chờ duyệt (PENDING -> ACTIVE) gọi API approveUser và nạp lại số liệu KPI', () => {
      api.getUsers.calls.reset();
      const NGUOI_DUNG_PENDING = nguoiDung({ id: 'u-pending', username: 'cho.duyet', status: 'PENDING' });
      const notify = spyOn(noiBo() as any, 'notify');
      noiBo()['approve'](NGUOI_DUNG_PENDING);

      expect(api.approveUser).toHaveBeenCalledOnceWith('u-pending');
      expect(api.getUsers).toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith(jasmine.stringContaining('cho.duyet'), 'success');
    });
  });

  // ---------------------------------------------------------------------------
  // BUG-079: mở khóa tài khoản phải qua bước xác nhận (nhất quán với Khóa/Xóa).
  describe('Mở khóa tài khoản qua xác nhận (BUG-079)', () => {
    const NGUOI_DUNG_KHOA = nguoiDung({ id: 'u-lock', username: 'bikhoa', displayName: 'Bị khóa', status: 'LOCKED' });

    beforeEach(() => taoTrang());

    it('bấm mở khóa một dòng chỉ mở modal, CHƯA gọi API', () => {
      noiBo()['openUnlock'](NGUOI_DUNG_KHOA);

      expect(noiBo()['unlockOpen']()).toBeTrue();
      expect(api.unlockUser).not.toHaveBeenCalled();
    });

    it('xác nhận mới gọi unlockUser, đóng modal và báo thành công', () => {
      noiBo()['openUnlock'](NGUOI_DUNG_KHOA);
      noiBo()['confirmUnlock']();

      expect(api.unlockUser).toHaveBeenCalledOnceWith('u-lock');
      expect(noiBo()['unlockOpen']()).toBeFalse();
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.text === 'Đã kích hoạt tài khoản bikhoa.')).toBe(true);
    });

    it('hủy modal thì không gọi API', () => {
      noiBo()['openUnlock'](NGUOI_DUNG_KHOA);
      noiBo()['closeUnlock']();

      expect(noiBo()['unlockOpen']()).toBeFalse();
      expect(api.unlockUser).not.toHaveBeenCalled();
    });

    it('mở khóa hàng loạt nhiều tài khoản đang chọn báo thông báo gộp', () => {
      const u1 = nguoiDung({ id: 'a1', username: 'a1' });
      const u2 = nguoiDung({ id: 'a2', username: 'a2' });
      noiBo()['users'].set([u1, u2]);
      noiBo()['selectedIds'].set(['a1', 'a2']);

      noiBo()['openUnlock']();
      expect(noiBo()['unlockOpen']()).toBeTrue();

      noiBo()['confirmUnlock']();
      expect(api.unlockUser).toHaveBeenCalledTimes(2);
      expect(TestBed.inject(AppMessageService).messages().some((m) => m.text === 'Đã kích hoạt các tài khoản đã chọn.')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Xem chi tiết tài khoản (modal)', () => {
    /** Text bên trong hộp thoại chi tiết — tách khỏi phần bảng để khỏi bắt nhầm chuỗi ở dòng khác. */
    function textModal(): string {
      const modal = fixture.nativeElement.querySelector('sg-modal') as HTMLElement | null;
      return modal?.textContent ?? '';
    }

    it('openView đặt signal viewUser và mở hộp chi tiết', () => {
      taoTrang();
      expect(fixture.nativeElement.querySelector('sg-modal')).toBeNull();

      noiBo()['openView'](NGUOI_DUNG_CHI_TIET);
      fixture.detectChanges();

      expect(noiBo()['viewUser']()).toBe(NGUOI_DUNG_CHI_TIET);
      expect(fixture.nativeElement.querySelector('sg-modal')).not.toBeNull();
    });

    it('hộp chi tiết hiện banner (tên/vai trò/trạng thái) và đủ 3 nhóm thông tin', () => {
      taoTrang();
      noiBo()['openView'](NGUOI_DUNG_CHI_TIET);
      fixture.detectChanges();

      const text = textModal();
      // Banner: tên, danh sách vai trò nối bằng dấu phẩy, nhãn trạng thái (LOCKED → "Đã khóa").
      expect(text).toContain('Lê Thị B');
      expect(text).toContain('Hải quan bước 1, Hải quan bước 2');
      expect(text).toContain(noiBo()['statusLabel']('LOCKED'));
      // Tiêu đề 3 nhóm.
      expect(text).toContain('Thông tin liên hệ');
      expect(text).toContain('Đơn vị & vai trò');
      expect(text).toContain('Hoạt động tài khoản');
    });

    it('hộp chi tiết lấy đúng các trường từ AdminUser', () => {
      taoTrang();
      noiBo()['openView'](NGUOI_DUNG_CHI_TIET);
      fixture.detectChanges();

      const text = textModal();
      expect(text).toContain('lethib@chc.gov.vn'); // email
      expect(text).toContain('0911222333'); // số điện thoại
      expect(text).toContain('lethib'); // tên đăng nhập
      expect(text).toContain('Chi cục Hải quan cửa khẩu'); // đơn vị
      expect(text).toContain('Chuyên viên nghiệp vụ'); // chức danh
    });

    it('trường ngày trống hiển thị "Chưa đăng nhập" thay cho ô rỗng', () => {
      taoTrang();
      noiBo()['openView'](nguoiDung({ id: 'u-8', username: 'moitao', lastLoginAt: null }));
      fixture.detectChanges();

      expect(textModal()).toContain('Chưa đăng nhập');
    });

    it('closeView xóa signal viewUser và gỡ hộp thoại', () => {
      taoTrang();
      noiBo()['openView'](NGUOI_DUNG_CHI_TIET);
      fixture.detectChanges();

      noiBo()['closeView']();
      fixture.detectChanges();

      expect(noiBo()['viewUser']()).toBeNull();
      expect(fixture.nativeElement.querySelector('sg-modal')).toBeNull();
    });

    it('editFromView đóng hộp chi tiết và mở biểu mẫu sửa cùng tài khoản', () => {
      taoTrang();
      noiBo()['openView'](NGUOI_DUNG_CHI_TIET);

      noiBo()['editFromView'](NGUOI_DUNG_CHI_TIET);

      expect(noiBo()['viewUser']()).toBeNull();
      expect(noiBo()['userFormOpen']()).toBe(true);
      expect(noiBo()['userForm'].id).toBe('u-7');
      expect(noiBo()['userForm'].username).toBe('lethib');
    });

    it('khối "Thông tin bổ sung" hiện mã số thuế với tài khoản doanh nghiệp', () => {
      taoTrang();
      noiBo()['openView'](
        nguoiDung({ id: 'u-dn', username: 'congtyabc', accountType: 'ENTERPRISE', taxCode: '5501234567' }),
      );
      fixture.detectChanges();

      const text = textModal();
      expect(text).toContain('Thông tin bổ sung');
      expect(text).toContain('Mã số thuế');
      expect(text).toContain('5501234567');
    });

    it('khối "Thông tin bổ sung" hiện số CCCD với tài khoản cá nhân, ẩn với tài khoản nội bộ', () => {
      taoTrang();
      noiBo()['openView'](
        nguoiDung({ id: 'u-cn', username: 'nguyenvanb', accountType: 'INDIVIDUAL', idNumber: '001099012345' }),
      );
      fixture.detectChanges();
      expect(textModal()).toContain('001099012345');

      noiBo()['openView'](NGUOI_DUNG_CHI_TIET); // accountType null → tài khoản nội bộ
      fixture.detectChanges();
      expect(textModal()).not.toContain('Thông tin bổ sung');
    });

    it('roleNames nối tên vai trò bằng dấu phẩy, rỗng thì trả gạch ngang', () => {
      taoTrang();
      expect(noiBo()['roleNames'](NGUOI_DUNG_CHI_TIET)).toBe('Hải quan bước 1, Hải quan bước 2');
      expect(noiBo()['roleNames'](nguoiDung({ id: 'u-0', username: 'x', roles: [] }))).toBe('—');
    });

    it('nút "Xem" hiện cho mọi dòng, không gắn quyền (đối chứng: nút sửa cần quyền thì ẩn)', () => {
      // Hồ sơ không có quyền hệ thống → các nút sửa/xóa bị ẩn, nhưng nút Xem vẫn phải hiện.
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ accessToken: 'token-gia-lap', profile: { ...hoSoQuanTri(), permissions: [] } }),
      );
      taoTrang();

      const viewButtons = fixture.nativeElement.querySelectorAll('button[title="Xem chi tiết"]');
      expect(viewButtons.length).toBe(noiBo()['users']().length);
      expect(viewButtons.length).toBeGreaterThan(0);
      expect(fixture.nativeElement.querySelector('button[title="Sửa thông tin"]')).toBeNull();
    });
  });
  describe('API errors handling', () => {
    it('saveUser bắt mảng errors và map xuống form, nếu không khớp hiển thị message chung', () => {
      taoTrang();
      noiBo()['openUserForm']();
      noiBo()['userForm'] = { accountType: 'ENTERPRISE', displayName: 'Valid Name', username: 'validUser123', password: 'ValidPassword123!', confirmPassword: 'ValidPassword123!', email: 'valid@email.com', phone: '0987654321', address: 'Valid Address', taxCode: '1234567890', representativeName: 'Rep Name' };
      const err = throwError(() => ({ status: 409, error: { messageKey: 'test', errors: [{ field: 'email', message: 'Email trùng' }, { field: 'unknown', message: 'Lỗi lạ' }] } }));
      api.createUser.and.returnValue(err);
      const appMessages = fixture.debugElement.injector.get(AppMessageService);
      spyOn(appMessages, 'show');
      noiBo()['saveUser']();
      expect(noiBo()['userFormErrors']().email).toBe('Email trùng');
      expect(appMessages.show).toHaveBeenCalledWith('Lỗi lạ', 'error');
    });

    it('saveUser chỉ có lỗi unmapped thì hiện thông báo chung, không bị lặp 2 lần', () => {
      taoTrang();
      noiBo()['openUserForm']();
      noiBo()['userForm'] = { accountType: 'ENTERPRISE', displayName: 'Valid Name', username: 'validUser123', password: 'ValidPassword123!', confirmPassword: 'ValidPassword123!', email: 'valid@email.com', phone: '0987654321', address: 'Valid Address', taxCode: '1234567890', representativeName: 'Rep Name' };
      const err = throwError(() => ({ status: 409, error: { messageKey: 'test', errors: [{ field: 'unknown', message: 'Lỗi lạ' }] } }));
      api.createUser.and.returnValue(err);
      const appMessages = fixture.debugElement.injector.get(AppMessageService);
      spyOn(appMessages, 'show');
      noiBo()['saveUser']();
      expect(appMessages.show).toHaveBeenCalledTimes(1);
      expect(appMessages.show).toHaveBeenCalledWith('Lỗi lạ', 'error');
    });
  });
});
