import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccessProfile } from '../../../core/auth/access-control.model';
import { SESSION_STORAGE_KEY } from '../../../core/auth/session.storage';
import { I18nService } from '../../../core/i18n/i18n.service';
import { ApiService, PermissionDefinition, RoleSummary } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { RoleManagementPageComponent } from './role-management-page.component';

/**
 * UI-07 (F03) Quản lý vai trò & phân quyền — màn RIÊNG (tách khỏi UI-13 quản trị người dùng).
 * Trước đây các test này thuộc `admin-users-page.component.spec.ts`; khi tách màn, logic vai trò và
 * ma trận phân quyền chuyển sang component mới nên các case cũng theo về đây, không mất độ phủ.
 * Sai ở đây là cấp nhầm quyền cho cả một vai trò, nên phủ kỹ nhánh chặn xóa, kiểm tra mã vai trò và
 * payload gửi lên API.
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
    menu: [{ key: 'admin', label: 'Quản trị', icon: 'settings', route: '/admin/roles' }],
  };
}

function vaiTro(mau: Partial<RoleSummary> & Pick<RoleSummary, 'id' | 'code' | 'name'>): RoleSummary {
  return { description: '', isSystem: false, isActive: true, userCount: 0, ...mau };
}

const VAI_TRO_HE_THONG = vaiTro({ id: 'r-1', code: 'QUAN_TRI', name: 'Quản trị hệ thống', isSystem: true, userCount: 2 });
const VAI_TRO_DANG_DUNG = vaiTro({ id: 'r-2', code: 'HAI_QUAN_B1', name: 'Hải quan bước 1', userCount: 5 });
const VAI_TRO_XOA_DUOC = vaiTro({ id: 'r-3', code: 'THU_NGHIEM', name: 'Vai trò thử nghiệm', userCount: 0 });

const DANH_MUC_QUYEN: PermissionDefinition[] = [
  { code: 'dossier.view', module: 'dossier', moduleLabel: 'Hồ sơ', action: 'view', actionLabel: 'Xem', name: 'Xem hồ sơ', sortOrder: 1 },
  { code: 'dossier.create', module: 'dossier', moduleLabel: 'Hồ sơ', action: 'create', actionLabel: 'Thêm', name: 'Thêm hồ sơ', sortOrder: 1 },
  { code: 'dossier.approve', module: 'dossier', moduleLabel: 'Hồ sơ', action: 'approve', actionLabel: 'Duyệt', name: 'Duyệt hồ sơ', sortOrder: 1 },
  { code: 'fee.view', module: 'fee', moduleLabel: 'Thu phí', action: 'view', actionLabel: 'Xem', name: 'Xem phí', sortOrder: 2 },
  { code: 'fee.approve', module: 'fee', moduleLabel: 'Thu phí', action: 'approve', actionLabel: 'Duyệt', name: 'Duyệt phí', sortOrder: 2 },
];

describe('RoleManagementPageComponent — vai trò và ma trận phân quyền', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<RoleManagementPageComponent>;
  let component: RoleManagementPageComponent;

  /** Truy cập thành viên protected/private của component trong phạm vi test. */
  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  /** Có toast đúng tông + đúng nội dung không (feedback thao tác nay đi qua toast góc màn hình). */
  function coToast(tone: string, text: string): boolean {
    return TestBed.inject(AppMessageService).messages().some((m) => m.tone === tone && m.text === text);
  }

  function taoTrang(): void {
    fixture = TestBed.createComponent(RoleManagementPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoQuanTri() }));

    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getRoles',
      'getPermissionCatalog',
      'getRolePermissions',
      'setRolePermissions',
      'createRole',
      'updateRole',
      'deleteRole',
      'lockRole',
      'unlockRole',
    ]);
    api.getRoles.and.returnValue(of([VAI_TRO_HE_THONG, VAI_TRO_DANG_DUNG, VAI_TRO_XOA_DUOC]));
    api.getPermissionCatalog.and.returnValue(of(DANH_MUC_QUYEN));
    api.getRolePermissions.and.returnValue(of(['dossier.view']));
    api.setRolePermissions.and.returnValue(of(void 0));
    api.createRole.and.returnValue(of(vaiTro({ id: 'r-9', code: 'MOI', name: 'Vai trò mới' })));
    api.updateRole.and.returnValue(of(VAI_TRO_XOA_DUOC));
    api.deleteRole.and.returnValue(of(void 0));
    api.lockRole.and.returnValue(of(vaiTro({ id: 'r-2', code: 'HAI_QUAN_B1', name: 'Hải quan bước 1', isActive: false, userCount: 5 })));
    api.unlockRole.and.returnValue(of(vaiTro({ id: 'r-2', code: 'HAI_QUAN_B1', name: 'Hải quan bước 1', isActive: true, userCount: 5 })));

    TestBed.configureTestingModule({
      imports: [RoleManagementPageComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    TestBed.inject(I18nService).setLocale('vi');
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // ---------------------------------------------------------------------------
  describe('Chặn xóa vai trò — deleteRoleBlockReason', () => {
    beforeEach(() => taoTrang());

    it('vai trò hệ thống không được xóa', () => {
      expect(noiBo()['deleteRoleBlockReason'](VAI_TRO_HE_THONG)).toBe('Vai trò hệ thống không được xóa');
    });

    it('vai trò đang gán cho tài khoản thì không được xóa và nêu rõ số lượng', () => {
      expect(noiBo()['deleteRoleBlockReason'](VAI_TRO_DANG_DUNG)).toBe('Đang gán cho 5 tài khoản');
    });

    it('vai trò thường, không tài khoản nào dùng thì được phép xóa', () => {
      expect(noiBo()['deleteRoleBlockReason'](VAI_TRO_XOA_DUOC)).toBe('');
    });

    it('tooltip hiện lý do chặn, không chặn thì hiện "Xóa vai trò"', () => {
      expect(noiBo()['deleteRoleTooltip'](VAI_TRO_DANG_DUNG)).toBe('Đang gán cho 5 tài khoản');
      expect(noiBo()['deleteRoleTooltip'](VAI_TRO_XOA_DUOC)).toBe('Xóa vai trò');
    });

    it('bấm xóa vai trò bị chặn thì không mở hộp xác nhận', () => {
      noiBo()['openDeleteRole'](VAI_TRO_HE_THONG);
      expect(noiBo()['roleDeleteTarget']()).toBeNull();

      noiBo()['openDeleteRole'](VAI_TRO_DANG_DUNG);
      expect(noiBo()['roleDeleteTarget']()).toBeNull();
    });

    it('vai trò được phép xóa thì mở hộp xác nhận và gọi API khi xác nhận', () => {
      noiBo()['openDeleteRole'](VAI_TRO_XOA_DUOC);
      expect(noiBo()['roleDeleteTarget']()).toBe(VAI_TRO_XOA_DUOC);

      noiBo()['confirmDeleteRole']();
      expect(api.deleteRole).toHaveBeenCalledOnceWith('r-3');
      expect(noiBo()['roleDeleteTarget']()).toBeNull();
      expect(coToast('success', 'Đã xóa vai trò THU_NGHIEM.')).toBe(true);
    });

    it('xóa vai trò lỗi thì báo lỗi và đóng hộp xác nhận', () => {
      api.deleteRole.and.returnValue(throwError(() => new Error('loi')));
      noiBo()['openDeleteRole'](VAI_TRO_XOA_DUOC);
      noiBo()['confirmDeleteRole']();

      expect(coToast('error', 'Không xóa được vai trò. Vai trò có thể đang được sử dụng.')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Kiểm tra mã vai trò — validateRoleCode', () => {
    beforeEach(() => taoTrang());

    function kiemTra(ma: string): string {
      return noiBo()['validateRoleCode'](ma);
    }

    it('mã rỗng', () => {
      expect(kiemTra('')).toBe('Vui lòng nhập mã vai trò.');
    });

    it('mã viết thường sai định dạng', () => {
      expect(kiemTra('hai_quan')).toBe('Mã vai trò chỉ gồm chữ in HOA, số và gạch dưới, bắt đầu bằng chữ cái.');
    });

    it('mã có khoảng trắng sai định dạng', () => {
      expect(kiemTra('HAI QUAN')).toBe('Mã vai trò chỉ gồm chữ in HOA, số và gạch dưới, bắt đầu bằng chữ cái.');
    });

    it('mã bắt đầu bằng số sai định dạng', () => {
      expect(kiemTra('1HAI_QUAN')).toBe('Mã vai trò chỉ gồm chữ in HOA, số và gạch dưới, bắt đầu bằng chữ cái.');
    });

    it('mã có dấu gạch ngang sai định dạng', () => {
      expect(kiemTra('HAI-QUAN')).toBe('Mã vai trò chỉ gồm chữ in HOA, số và gạch dưới, bắt đầu bằng chữ cái.');
    });

    it('mã quá 50 ký tự', () => {
      expect(kiemTra('A'.repeat(51))).toBe('Mã vai trò không quá 50 ký tự.');
      expect(kiemTra('A'.repeat(50))).toBe('');
    });

    it('mã trùng vai trò đã có', () => {
      expect(kiemTra('HAI_QUAN_B1')).toBe('Mã vai trò này đã tồn tại.');
    });

    it('mã hợp lệ và chưa tồn tại', () => {
      expect(kiemTra('HAI_QUAN_CK')).toBe('');
      expect(kiemTra('KIEM_DICH')).toBe('');
    });

    it('mã vai trò luôn được chuyển sang chữ HOA khi gõ', () => {
      noiBo()['setRoleCode']('kiem_dich_yt');
      expect(noiBo()['roleForm'].code).toBe('KIEM_DICH_YT');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Tạo và sửa vai trò', () => {
    beforeEach(() => taoTrang());

    it('tạo vai trò mới thì gửi đúng payload, tự chọn vai trò mới và nạp ma trận quyền của nó', () => {
      const vaiTroMoi = vaiTro({ id: 'r-9', code: 'KIEM_DICH_YT', name: 'Kiểm dịch y tế' });
      api.createRole.and.returnValue(of(vaiTroMoi));
      api.getRoles.and.returnValue(of([VAI_TRO_HE_THONG, VAI_TRO_DANG_DUNG, VAI_TRO_XOA_DUOC, vaiTroMoi]));
      api.getRolePermissions.calls.reset();
      api.getRolePermissions.and.returnValue(of(['dossier.view', 'dossier.approve']));

      noiBo()['openRoleForm']();
      noiBo()['roleForm'].code = 'KIEM_DICH_YT';
      noiBo()['roleForm'].name = 'Kiểm dịch y tế';
      noiBo()['roleForm'].description = 'Kiểm dịch y tế biên giới';
      noiBo()['saveRole']();

      expect(api.createRole).toHaveBeenCalledOnceWith({
        code: 'KIEM_DICH_YT',
        name: 'Kiểm dịch y tế',
        description: 'Kiểm dịch y tế biên giới',
      });
      expect(noiBo()['roleFormOpen']()).toBe(false);
      expect(noiBo()['selectedRoleId']()).toBe('r-9');
      expect(api.getRolePermissions).toHaveBeenCalledOnceWith('r-9');
      expect(noiBo()['grantedCodes']()).toEqual(['dossier.view', 'dossier.approve']);
      expect(coToast('success', 'Đã tạo vai trò KIEM_DICH_YT. Hãy tích chọn quyền trong ma trận phân quyền.')).toBe(true);
    });

    it('mã vai trò không hợp lệ thì không gọi API', () => {
      noiBo()['openRoleForm']();
      noiBo()['roleForm'].code = 'kiem dich';
      noiBo()['roleForm'].name = 'Kiểm dịch';
      noiBo()['saveRole']();

      expect(api.createRole).not.toHaveBeenCalled();
      expect(noiBo()['roleCodeError']()).toBe('Mã vai trò chỉ gồm chữ in HOA, số và gạch dưới, bắt đầu bằng chữ cái.');
      expect(noiBo()['roleFormOpen']()).toBe(true);
    });

    it('thiếu tên vai trò thì không gọi API', () => {
      noiBo()['openRoleForm']();
      noiBo()['roleForm'].code = 'HAI_QUAN_CK';
      noiBo()['roleForm'].name = '   ';
      noiBo()['saveRole']();

      expect(api.createRole).not.toHaveBeenCalled();
      expect(noiBo()['roleNameError']()).toBe('Vui lòng nhập tên vai trò.');
    });

    it('tạo vai trò lỗi (mã đã tồn tại phía API) thì giữ form và báo lỗi', () => {
      api.createRole.and.returnValue(throwError(() => new Error('trung ma')));
      noiBo()['openRoleForm']();
      noiBo()['roleForm'].code = 'HAI_QUAN_CK';
      noiBo()['roleForm'].name = 'Hải quan bước 5';
      noiBo()['saveRole']();

      expect(noiBo()['roleFormOpen']()).toBe(true);
      expect(noiBo()['roleFormError']()).toBe('Không tạo được vai trò. Mã vai trò có thể đã tồn tại.');
      expect(noiBo()['savingRole']()).toBe(false);
    });

    it('sửa vai trò chỉ gửi tên và mô tả, không gửi mã', () => {
      noiBo()['openRoleForm'](VAI_TRO_DANG_DUNG);
      noiBo()['roleForm'].name = 'Hải quan bước 1 (sửa)';
      noiBo()['roleForm'].description = 'Mô tả mới';
      noiBo()['saveRole']();

      expect(api.updateRole).toHaveBeenCalledOnceWith('r-2', { name: 'Hải quan bước 1 (sửa)', description: 'Mô tả mới' });
      expect(api.createRole).not.toHaveBeenCalled();
      expect(coToast('success', 'Đã cập nhật thông tin vai trò.')).toBe(true);
    });

    it('sửa vai trò không kiểm lại mã trùng của chính nó', () => {
      noiBo()['openRoleForm'](VAI_TRO_DANG_DUNG);
      noiBo()['saveRole']();

      expect(noiBo()['roleCodeError']()).toBe('');
      expect(api.updateRole).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Ma trận phân quyền', () => {
    beforeEach(() => taoTrang());

    it('dựng lưới phân hệ × hành động từ danh mục quyền của API', () => {
      expect(noiBo()['matrixActions']().map((action: { code: string }) => action.code)).toEqual(['view', 'create', 'approve']);
      expect(noiBo()['matrixRows']().map((row: { module: string }) => row.module)).toEqual(['dossier', 'fee']);
      expect(noiBo()['matrixRows']()[0].cells).toEqual({
        view: 'dossier.view',
        create: 'dossier.create',
        approve: 'dossier.approve',
      });
    });

    it('phân hệ thiếu hành động thì ô tương ứng bỏ trống', () => {
      const dongThuPhi = noiBo()['matrixRows']()[1];
      expect(dongThuPhi.cells['create']).toBeUndefined();
      expect(dongThuPhi.cells['view']).toBe('fee.view');
    });

    it('bảng hiển thị đủ số dòng và số cột hành động', () => {
      const bang = fixture.nativeElement.querySelector('table.matrix') as HTMLTableElement;
      expect(bang.querySelectorAll('thead th').length).toBe(4); // 1 cột phân hệ + 3 hành động
      expect(bang.querySelectorAll('tbody tr').length).toBe(2);
      expect(bang.querySelectorAll('tbody input[type="checkbox"]').length).toBe(7); // 5 ô quyền + 2 ô chọn phân hệ
    });

    it('chọn vai trò thì nạp quyền đang có của vai trò đó', () => {
      api.getRolePermissions.calls.reset();
      api.getRolePermissions.and.returnValue(of(['fee.view', 'fee.approve']));

      noiBo()['selectRole']('r-2');

      expect(api.getRolePermissions).toHaveBeenCalledOnceWith('r-2');
      expect(noiBo()['grantedCodes']()).toEqual(['fee.view', 'fee.approve']);
      expect(noiBo()['hasGranted']('fee.view')).toBe(true);
      expect(noiBo()['hasGranted']('dossier.view')).toBe(false);
    });

    it('bỏ chọn vai trò thì xóa sạch quyền đang hiển thị và không gọi API', () => {
      api.getRolePermissions.calls.reset();
      noiBo()['selectRole']('');

      expect(api.getRolePermissions).not.toHaveBeenCalled();
      expect(noiBo()['grantedCodes']()).toEqual([]);
    });

    it('nạp quyền của vai trò lỗi thì báo lỗi', () => {
      api.getRolePermissions.and.returnValue(throwError(() => new Error('loi')));
      noiBo()['selectRole']('r-2');

      expect(noiBo()['matrixError']()).toBe('Không tải được quyền của vai trò này.');
      expect(noiBo()['matrixLoading']()).toBe(false);
    });

    it('tích/bỏ tích một ô cập nhật danh sách quyền', () => {
      noiBo()['selectRole']('r-2');
      noiBo()['grantedCodes'].set(['dossier.view']);

      noiBo()['toggleGrant']('fee.approve');
      expect(noiBo()['grantedCodes']()).toEqual(['dossier.view', 'fee.approve']);

      noiBo()['toggleGrant']('dossier.view');
      expect(noiBo()['grantedCodes']()).toEqual(['fee.approve']);
    });

    it('"Cấp tất cả" tích toàn bộ mã quyền trong danh mục', () => {
      noiBo()['grantAll'](true);
      expect(noiBo()['grantedCodes']()).toEqual(DANH_MUC_QUYEN.map((item) => item.code));
    });

    it('"Bỏ tất cả" xóa sạch quyền', () => {
      noiBo()['grantAll'](true);
      noiBo()['grantAll'](false);
      expect(noiBo()['grantedCodes']()).toEqual([]);
    });

    it('lưu ma trận gửi đúng vai trò và đúng mảng mã quyền', () => {
      noiBo()['selectRole']('r-2');
      noiBo()['grantedCodes'].set([]);
      noiBo()['toggleGrant']('fee.view');
      noiBo()['toggleGrant']('fee.approve');

      noiBo()['saveMatrix']();

      expect(api.setRolePermissions).toHaveBeenCalledOnceWith('r-2', ['fee.view', 'fee.approve']);
      expect(coToast('success', 'Đã lưu ma trận phân quyền.')).toBe(true);
      expect(noiBo()['savingMatrix']()).toBe(false);
    });

    it('chưa chọn vai trò thì không lưu được ma trận', () => {
      noiBo()['selectRole']('');
      noiBo()['saveMatrix']();
      expect(api.setRolePermissions).not.toHaveBeenCalled();
    });

    it('lưu ma trận lỗi thì báo lỗi và mở lại nút lưu', () => {
      api.setRolePermissions.and.returnValue(throwError(() => new Error('loi')));
      noiBo()['selectRole']('r-2');
      noiBo()['saveMatrix']();

      expect(noiBo()['matrixError']()).toBe('Không lưu được phân quyền. Vui lòng thử lại.');
      expect(noiBo()['savingMatrix']()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // BUG-059: chống SYS_ADMIN tự gỡ sạch quyền của chính mình (tự khóa toàn hệ thống).
  describe('Chống tự khóa SYS_ADMIN (BUG-059)', () => {
    const VAI_TRO_SYS_ADMIN = vaiTro({ id: 'r-sa', code: 'SYS_ADMIN', name: 'Quản trị hệ thống', isSystem: true, userCount: 3 });

    /** Đăng nhập bằng chính tài khoản mang vai trò SYS_ADMIN và cho danh sách có vai trò đó. */
    function dangNhapSysAdmin(): void {
      const profile = hoSoQuanTri();
      profile.roles = [{ code: 'SYS_ADMIN', name: 'Quản trị hệ thống', dataScope: 'ALL' }];
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile }));
      api.getRoles.and.returnValue(of([VAI_TRO_SYS_ADMIN, VAI_TRO_DANG_DUNG]));
    }

    it('isSysAdminSelf đúng khi đang mang vai trò SYS_ADMIN và đang chọn chính nó', () => {
      dangNhapSysAdmin();
      api.getRolePermissions.and.returnValue(of([...QUYEN_QUAN_TRI]));
      taoTrang();

      expect(noiBo()['selectedRole']()?.code).toBe('SYS_ADMIN');
      expect(noiBo()['isSysAdminSelf']()).toBeTrue();
    });

    it('"Bỏ tất cả" KHÔNG xóa quyền của chính vai trò SYS_ADMIN mình đang mang', () => {
      dangNhapSysAdmin();
      api.getRolePermissions.and.returnValue(of([...QUYEN_QUAN_TRI]));
      taoTrang();

      noiBo()['grantAll'](false);

      expect(noiBo()['grantedCodes']()).toEqual([...QUYEN_QUAN_TRI]);
    });

    it('ma trận thiếu quyền quản trị cốt lõi → không lưu, không gọi API', () => {
      dangNhapSysAdmin();
      api.getRolePermissions.and.returnValue(of(['dossier.view'])); // thiếu system.*
      taoTrang();

      expect(noiBo()['sysAdminCoreMissing']()).toBeTrue();
      noiBo()['saveMatrix']();
      expect(api.setRolePermissions).not.toHaveBeenCalled();
    });

    it('giữ đủ quyền quản trị cốt lõi → lưu bình thường', () => {
      dangNhapSysAdmin();
      api.getRolePermissions.and.returnValue(of([...QUYEN_QUAN_TRI]));
      taoTrang();

      expect(noiBo()['sysAdminCoreMissing']()).toBeFalse();
      noiBo()['saveMatrix']();
      expect(api.setRolePermissions).toHaveBeenCalledOnceWith('r-sa', [...QUYEN_QUAN_TRI]);
    });

    it('vai trò khác (không phải SYS_ADMIN) không bị rào dù người dùng là SYS_ADMIN', () => {
      dangNhapSysAdmin();
      taoTrang();
      noiBo()['selectRole']('r-2');

      expect(noiBo()['isSysAdminSelf']()).toBeFalse();
      expect(noiBo()['sysAdminCoreMissing']()).toBeFalse();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Biểu tượng vai trò theo MÃ (không suy từ tên tiếng Việt)', () => {
    beforeEach(() => taoTrang());

    it('mã đã biết trả đúng icon và tông màu', () => {
      expect(noiBo()['roleIcon']('SYS_ADMIN')).toBe('shield');
      expect(noiBo()['roleIconTone']('SYS_ADMIN')).toBe('purple');
      expect(noiBo()['roleIcon']('FEE_COLLECTOR')).toBe('payments');
      expect(noiBo()['roleIconTone']('FEE_COLLECTOR')).toBe('red');
      expect(noiBo()['roleIcon']('CUSTOMS')).toBe('fact_check');
      expect(noiBo()['roleIconTone']('CUSTOMS')).toBe('blue');
    });

    it('mã lạ (vai trò động) rơi về biểu tượng trung tính', () => {
      expect(noiBo()['roleIcon']('MA_LA_KHONG_CO')).toBe('badge');
      expect(noiBo()['roleIconTone']('MA_LA_KHONG_CO')).toBe('neutral');
      // Mã QUAN_TRI của seed cũng không nằm trong bảng icon → mặc định.
      expect(noiBo()['roleIcon']('QUAN_TRI')).toBe('badge');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Thanh phạm vi quyền của vai trò đang chọn', () => {
    beforeEach(() => taoTrang());

    it('scopeGranted/scopeTotal/scopePercent tính từ grantedCodes trên tổng danh mục', () => {
      // Khởi tạo: chọn r-1, getRolePermissions trả ['dossier.view'] → 1/5 = 20%.
      expect(noiBo()['scopeTotal']()).toBe(5);
      expect(noiBo()['scopeGranted']()).toBe(1);
      expect(noiBo()['scopePercent']()).toBe(20);
    });

    it('danh mục quyền rỗng (total = 0) thì phần trăm là 0, không chia cho 0', () => {
      noiBo()['permissionCatalog'].set([]);
      expect(noiBo()['scopeTotal']()).toBe(0);
      expect(noiBo()['scopePercent']()).toBe(0);
    });

    it('thanh phạm vi chỉ render ở đúng một vai trò đang chọn', () => {
      const thanhScope = (fixture.nativeElement as HTMLElement).querySelectorAll('.roles__scope-bar');
      expect(thanhScope.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Khóa / mở khóa vai trò (F03)', () => {
    const VAI_TRO_DA_KHOA = vaiTro({ id: 'r-4', code: 'BAO_HIEM', name: 'Bảo hiểm', isActive: false, userCount: 1 });

    it('vai trò đã khóa hiện badge "Đã khóa" trong danh sách', () => {
      api.getRoles.and.returnValue(of([VAI_TRO_HE_THONG, VAI_TRO_DANG_DUNG, VAI_TRO_DA_KHOA]));
      taoTrang();

      const badges = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.tag--locked')).map(
        (el) => (el as HTMLElement).textContent?.trim(),
      );
      expect(badges).toContain('Đã khóa');
    });

    it('nút Khóa của vai trò hệ thống bị vô hiệu trên DOM', () => {
      taoTrang();

      const nutKhoa = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.iconbtn'),
      ).find((el) => el.querySelector('mat-icon')?.textContent?.trim() === 'lock' && (el as HTMLButtonElement).disabled);
      expect(nutKhoa).toBeTruthy();
    });

    it('bấm khóa vai trò hệ thống thì KHÔNG mở modal xác nhận', () => {
      taoTrang();
      noiBo()['openLockRole'](VAI_TRO_HE_THONG);
      expect(noiBo()['roleLockTarget']()).toBeNull();
    });

    it('khóa vai trò thường: mở modal rồi xác nhận gọi lockRole, tải lại và báo thành công', () => {
      taoTrang();
      noiBo()['openLockRole'](VAI_TRO_DANG_DUNG);
      expect(noiBo()['roleLockTarget']()).toBe(VAI_TRO_DANG_DUNG);

      const soLanTai = api.getRoles.calls.count();
      noiBo()['confirmToggleLock']();

      expect(api.lockRole).toHaveBeenCalledOnceWith('r-2');
      expect(api.unlockRole).not.toHaveBeenCalled();
      expect(noiBo()['roleLockTarget']()).toBeNull();
      expect(api.getRoles.calls.count()).toBe(soLanTai + 1);
      expect(coToast('success', 'Đã khóa vai trò HAI_QUAN_B1.')).toBe(true);
    });

    it('mở khóa vai trò đã khóa thì gọi unlockRole và báo mở khóa', () => {
      api.getRoles.and.returnValue(of([VAI_TRO_HE_THONG, VAI_TRO_DA_KHOA]));
      taoTrang();
      noiBo()['openLockRole'](VAI_TRO_DA_KHOA);
      noiBo()['confirmToggleLock']();

      expect(api.unlockRole).toHaveBeenCalledOnceWith('r-4');
      expect(api.lockRole).not.toHaveBeenCalled();
      expect(coToast('success', 'Đã mở khóa vai trò BAO_HIEM.')).toBe(true);
    });

    it('khóa lỗi thì báo lỗi và đóng modal', () => {
      api.lockRole.and.returnValue(throwError(() => new Error('loi')));
      taoTrang();
      noiBo()['openLockRole'](VAI_TRO_DANG_DUNG);
      noiBo()['confirmToggleLock']();

      expect(coToast('error', 'Không khóa được vai trò. Vui lòng thử lại.')).toBe(true);
      expect(noiBo()['roleLockTarget']()).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Nạp dữ liệu ban đầu', () => {
    it('chọn sẵn vai trò đầu tiên và nạp quyền của vai trò đó', () => {
      taoTrang();
      expect(api.getRoles).toHaveBeenCalledTimes(1);
      expect(api.getPermissionCatalog).toHaveBeenCalledTimes(1);
      expect(noiBo()['selectedRoleId']()).toBe('r-1');
      expect(noiBo()['selectedRole']()?.code).toBe('QUAN_TRI');
    });

    it('không tải được danh sách vai trò thì báo lỗi và không chọn vai trò nào', () => {
      api.getRoles.and.returnValue(throwError(() => new Error('loi')));
      taoTrang();

      expect(noiBo()['rolesError']()).toBe('Không tải được danh sách vai trò. Vui lòng thử lại.');
      expect(noiBo()['selectedRoleId']()).toBe('');
      expect(noiBo()['roles']()).toEqual([]);
    });

    it('không tải được danh mục quyền thì ma trận báo lỗi', () => {
      api.getPermissionCatalog.and.returnValue(throwError(() => new Error('loi')));
      taoTrang();

      expect(noiBo()['matrixError']()).toBe('Không tải được danh mục quyền.');
      expect(noiBo()['matrixRows']()).toEqual([]);
    });

    it('lọc vai trò theo từ khóa tìm kiếm (tên, mã, mô tả)', () => {
      taoTrang();
      noiBo()['roleKeyword'].set('hai_quan');
      expect(noiBo()['filteredRoles']().map((role: RoleSummary) => role.id)).toEqual(['r-2']);

      noiBo()['roleKeyword'].set('thử nghiệm');
      expect(noiBo()['filteredRoles']().map((role: RoleSummary) => role.id)).toEqual(['r-3']);

      noiBo()['roleKeyword'].set('');
      expect(noiBo()['filteredRoles']().length).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Bộ lọc loại vai trò / trạng thái + thẻ đang hoạt động', () => {
    const VAI_TRO_KHOA = vaiTro({ id: 'r-5', code: 'TAM_KHOA', name: 'Tạm khóa', isActive: false, userCount: 0 });

    function idsLoc(): string[] {
      return noiBo()['filteredRoles']().map((role: RoleSummary) => role.id);
    }

    it('lọc theo loại vai trò: hệ thống chỉ giữ isSystem, tùy chỉnh giữ phần còn lại', () => {
      taoTrang();
      noiBo()['roleTypeFilter'].set('system');
      expect(idsLoc()).toEqual(['r-1']);

      noiBo()['roleTypeFilter'].set('custom');
      expect(idsLoc()).toEqual(['r-2', 'r-3']);
    });

    it('lọc theo trạng thái: hoạt động và tạm khóa', () => {
      api.getRoles.and.returnValue(of([VAI_TRO_HE_THONG, VAI_TRO_DANG_DUNG, VAI_TRO_KHOA]));
      taoTrang();

      noiBo()['roleStatusFilter'].set('locked');
      expect(idsLoc()).toEqual(['r-5']);

      noiBo()['roleStatusFilter'].set('active');
      expect(idsLoc()).toEqual(['r-1', 'r-2']);
    });

    it('kết hợp loại + trạng thái + từ khóa cùng lúc', () => {
      api.getRoles.and.returnValue(of([VAI_TRO_HE_THONG, VAI_TRO_DANG_DUNG, VAI_TRO_KHOA]));
      taoTrang();

      noiBo()['roleTypeFilter'].set('custom');
      noiBo()['roleStatusFilter'].set('active');
      noiBo()['roleKeyword'].set('hai');
      expect(idsLoc()).toEqual(['r-2']);
      
    });

    it('thẻ "Vai trò đang hoạt động" đếm đúng số vai trò isActive', () => {
      api.getRoles.and.returnValue(of([VAI_TRO_HE_THONG, VAI_TRO_DANG_DUNG, VAI_TRO_KHOA]));
      taoTrang();
      expect(noiBo()['activeRoleCount']()).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // BUG-067: mỗi vai trò chỉ được vẽ MỘT lần trong DOM (không nhân đôi nút khóa).
  describe('Không nhân đôi vai trò trong DOM (BUG-067)', () => {
    it('mỗi vai trò hoạt động chỉ có ĐÚNG MỘT nút "Khóa vai trò ..."', () => {
      taoTrang();
      const nutKhoa = (fixture.nativeElement as HTMLElement).querySelectorAll('[aria-label^="Khóa vai trò"]');
      const soActive = (noiBo()['roles']() as RoleSummary[]).filter((role) => role.isActive).length;
      // 3 vai trò seed đều đang hoạt động → đúng 3 nút, KHÔNG phải 6 (nhân đôi).
      expect(soActive).toBe(3);
      expect(nutKhoa.length).toBe(soActive);
    });
  });

  // ---------------------------------------------------------------------------
  // BUG-080: vai trò đang hoạt động cũng có badge trạng thái (khớp nhãn bộ lọc "Đang hoạt động").
  describe('Badge trạng thái vai trò đang hoạt động (BUG-080)', () => {
    const VAI_TRO_DA_KHOA = vaiTro({ id: 'r-4', code: 'BAO_HIEM', name: 'Bảo hiểm', isActive: false, userCount: 1 });

    it('vai trò isActive hiện badge "Đang hoạt động"; số badge khớp số vai trò hoạt động', () => {
      api.getRoles.and.returnValue(of([VAI_TRO_HE_THONG, VAI_TRO_DANG_DUNG, VAI_TRO_DA_KHOA]));
      taoTrang();

      const badges = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.tag--active')).map(
        (el) => (el as HTMLElement).textContent?.trim(),
      );
      expect(badges).toContain('Đang hoạt động');
      // 2 vai trò hoạt động (hệ thống + đang dùng), vai trò đã khóa không có badge active.
      expect(badges.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // BUG-081: vai trò hệ thống không được sửa (nút Sửa vô hiệu + chặn mở form).
  describe('Vai trò hệ thống không cho sửa (BUG-081)', () => {
    function nutSua(): HTMLButtonElement[] {
      return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.iconbtn')).filter(
        (el) => el.querySelector('mat-icon')?.textContent?.trim() === 'edit',
      ) as HTMLButtonElement[];
    }

    it('nút Sửa của vai trò hệ thống bị vô hiệu, vai trò thường thì bật', () => {
      taoTrang();
      const nut = nutSua();
      expect(nut.some((el) => el.disabled)).toBeTrue(); // QUAN_TRI (hệ thống)
      expect(nut.some((el) => !el.disabled)).toBeTrue(); // vai trò thường
    });

    it('openRoleForm KHÔNG mở biểu mẫu cho vai trò hệ thống', () => {
      taoTrang();
      noiBo()['openRoleForm'](VAI_TRO_HE_THONG);
      expect(noiBo()['roleFormOpen']()).toBeFalse();

      noiBo()['openRoleForm'](VAI_TRO_DANG_DUNG);
      expect(noiBo()['roleFormOpen']()).toBeTrue();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Đa ngôn ngữ tên và mô tả vai trò (roleName & roleDescription)', () => {
    it('vai trò hệ thống tra đúng tên và mô tả theo ngôn ngữ', () => {
      taoTrang();
      const roleBorderGuard = vaiTro({
        id: 'r-bg',
        code: 'BORDER_GUARD',
        name: 'Biên phòng',
        description: 'Kiểm tra an ninh và xuất nhập cảnh',
        isSystem: true,
      });
      expect(noiBo()['roleName'](roleBorderGuard)).toBe('Biên phòng');
      expect(noiBo()['roleDescription'](roleBorderGuard)).toContain('Kiểm tra an ninh');

      // Khi đổi sang EN
      TestBed.inject(I18nService).setLocale('en');
      expect(noiBo()['roleName'](roleBorderGuard)).toBe('Border guard');
      expect(noiBo()['roleDescription'](roleBorderGuard)).toContain('Inspect security');

      // Trả lại VI
      TestBed.inject(I18nService).setLocale('vi');
    });

    it('vai trò tùy chỉnh giữ nguyên tên và mô tả nhập từ DB', () => {
      taoTrang();
      const customRole = vaiTro({ id: 'r-c', code: 'CUSTOM_ROLE', name: 'Vai trò tùy chỉnh', description: 'Mô tả tùy chỉnh', isSystem: false });
      expect(noiBo()['roleName'](customRole)).toBe('Vai trò tùy chỉnh');
      expect(noiBo()['roleDescription'](customRole)).toBe('Mô tả tùy chỉnh');

      TestBed.inject(I18nService).setLocale('en');
      expect(noiBo()['roleName'](customRole)).toBe('Vai trò tùy chỉnh');
      expect(noiBo()['roleDescription'](customRole)).toBe('Mô tả tùy chỉnh');

      TestBed.inject(I18nService).setLocale('vi');
    });

    it('mã GATE_OFFICER và INDIVIDUAL có icon và tone', () => {
      taoTrang();
      expect(noiBo()['roleIcon']('GATE_OFFICER')).toBe('meeting_room');
      expect(noiBo()['roleIcon']('INDIVIDUAL')).toBe('badge');
    });
  });
});
