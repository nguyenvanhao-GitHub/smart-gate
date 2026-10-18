import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { ApiService } from '../services/api.service';
import { AccessProfile, MenuItem, PermissionRequirement } from './access-control.model';
import { authGuard, guestGuard, homeRedirectGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { SESSION_STORAGE_KEY } from './session.storage';

/**
 * Phân quyền route theo MÃ QUYỀN lấy từ API (`GET /access-control/me`),
 * không còn bảng vai trò hard-code. Mọi dữ liệu test dựng từ hồ sơ truy cập giả lập.
 */

const MENU_MAU: MenuItem[] = [
  {
    key: 'dossier',
    label: 'Hồ sơ',
    icon: 'description',
    route: '',
    children: [
      { key: 'dossier-list', label: 'Danh sách hồ sơ', icon: 'list', route: '/declarations' },
      { key: 'dossier-new', label: 'Tạo hồ sơ', icon: 'add', route: '/declarations/new' },
    ],
  },
  { key: 'fee', label: 'Thu phí', icon: 'payments', route: '/fees/tax' },
];

function hoSoTruyCap(permissions: string[], menu: MenuItem[] = MENU_MAU): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'nguyenvana',
      displayName: 'Nguyễn Văn A',
      title: 'Chuyên viên',
      email: 'a@chc.gov.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: { id: 'org-1', code: 'CK-CK', name: 'Cửa khẩu Chiềng Khương' },
    },
    roles: [{ code: 'VAI_TRO_TEST', name: 'Vai trò thử nghiệm', dataScope: 'ORGANIZATION' }],
    permissions,
    assignments: [],
    menu,
  };
}

function dungMoiTruong(profile?: AccessProfile): void {
  localStorage.clear();
  sessionStorage.clear();
  if (profile) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token-gia-lap', profile }));
  }
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: ApiService, useValue: {} }],
  });
}

function chayGuard(url: string, permission?: PermissionRequirement): boolean | UrlTree {
  const route = { data: permission === undefined ? {} : { permission } } as unknown as ActivatedRouteSnapshot;
  const state = { url } as RouterStateSnapshot;
  return TestBed.runInInjectionContext(() => authGuard(route, state)) as boolean | UrlTree;
}

function duongDanCua(ketQua: boolean | UrlTree): string {
  return TestBed.inject(Router).serializeUrl(ketQua as UrlTree);
}

describe('authGuard — phân quyền route theo mã quyền động', () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // ---------------------------------------------------------------------------
  describe('Chưa đăng nhập', () => {
    beforeEach(() => dungMoiTruong());

    it('chuyển hướng về /login kèm returnUrl', () => {
      const ketQua = chayGuard('/declarations', 'dossier.view');
      expect(ketQua).not.toBe(true);
      expect(duongDanCua(ketQua)).toBe('/login?returnUrl=%2Fdeclarations');
    });

    it('giữ nguyên tham số truy vấn trong returnUrl', () => {
      expect(duongDanCua(chayGuard('/fees/tax?page=2', 'fee.view'))).toBe('/login?returnUrl=%2Ffees%2Ftax%3Fpage%3D2');
    });

    it('phiên hỏng trong storage bị coi như chưa đăng nhập', () => {
      localStorage.setItem(SESSION_STORAGE_KEY, '{khong-phai-json');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ApiService, useValue: {} }] });
      expect(duongDanCua(chayGuard('/declarations', 'dossier.view'))).toBe('/login?returnUrl=%2Fdeclarations');
    });

    it('có token nhưng chưa có hồ sơ truy cập cũng bị coi như chưa đăng nhập', () => {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'token', profile: null }));
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ApiService, useValue: {} }] });
      expect(duongDanCua(chayGuard('/declarations', 'dossier.view'))).toBe('/login?returnUrl=%2Fdeclarations');
    });

    it('guestGuard cho phép vào trang đăng nhập', () => {
      const ketQua = TestBed.runInInjectionContext(() => guestGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
      expect(ketQua).toBe(true);
    });

    it('homeRedirectGuard đẩy về /login', () => {
      const ketQua = TestBed.runInInjectionContext(() =>
        homeRedirectGuard({} as ActivatedRouteSnapshot, { url: '/' } as RouterStateSnapshot),
      );
      expect(duongDanCua(ketQua as UrlTree)).toBe('/login?returnUrl=%2F');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Đã đăng nhập — kiểm theo data.permission', () => {
    it('có đúng quyền thì cho qua', () => {
      dungMoiTruong(hoSoTruyCap(['dossier.view']));
      expect(chayGuard('/declarations', 'dossier.view')).toBe(true);
    });

    it('thiếu quyền thì bị chặn và đẩy về route mặc định', () => {
      dungMoiTruong(hoSoTruyCap(['dossier.view']));
      const ketQua = chayGuard('/admin/users', 'system.view');
      expect(ketQua).not.toBe(true);
      expect(duongDanCua(ketQua)).toBe('/declarations');
    });

    it('route không khai quyền thì chỉ cần đăng nhập', () => {
      dungMoiTruong(hoSoTruyCap([]));
      expect(chayGuard('/profile')).toBe(true);
    });

    it('mảng quyền — có BẤT KỲ quyền nào là đủ', () => {
      dungMoiTruong(hoSoTruyCap(['fee.approve']));
      expect(chayGuard('/fees/tax', ['fee.view', 'fee.approve'])).toBe(true);
    });

    it('mảng quyền — không có quyền nào thì bị chặn', () => {
      dungMoiTruong(hoSoTruyCap(['dossier.view']));
      expect(chayGuard('/fees/tax', ['fee.view', 'fee.approve'])).not.toBe(true);
    });

    it('khai mảng quyền rỗng tường minh thì bị chặn (fail-closed)', () => {
      // Khác với route không khai `data.permission`: mảng rỗng nghĩa là không mã quyền nào thỏa mãn.
      dungMoiTruong(hoSoTruyCap(['dossier.view']));
      expect(chayGuard('/declarations', [])).not.toBe(true);
    });

    it('data.permission = null cũng được coi là không ràng buộc', () => {
      dungMoiTruong(hoSoTruyCap([]));
      expect(chayGuard('/profile', null)).toBe(true);
    });

    it('không đẩy về chính route vừa bị chặn — tránh lặp vô hạn', () => {
      // Route mặc định trùng với route bị chặn → phải rơi về /profile.
      dungMoiTruong(hoSoTruyCap([], [{ key: 'dossier', label: 'Hồ sơ', icon: 'description', route: '/declarations' }]));
      const ketQua = chayGuard('/declarations', 'dossier.view');
      expect(duongDanCua(ketQua)).toBe('/profile');
    });

    it('bỏ qua query string khi so sánh với route mặc định', () => {
      dungMoiTruong(hoSoTruyCap([], [{ key: 'dossier', label: 'Hồ sơ', icon: 'description', route: '/declarations' }]));
      expect(duongDanCua(chayGuard('/declarations?trang=2', 'dossier.view'))).toBe('/profile');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Chống truy cập chéo giữa các phân hệ', () => {
    const PHAN_HE: Array<{ url: string; quyen: string }> = [
      { url: '/declarations', quyen: 'dossier.view' },
      { url: '/fees/tax', quyen: 'fee.view' },
      { url: '/reports/general', quyen: 'report.view' },
      { url: '/admin/users', quyen: 'system.view' },
      { url: '/operations/customs-b1', quyen: 'workflow.view' },
    ];

    PHAN_HE.forEach((muc) => {
      it(`tài khoản chỉ có ${muc.quyen} vào được ${muc.url} và bị chặn khỏi các phân hệ còn lại`, () => {
        dungMoiTruong(hoSoTruyCap([muc.quyen]));
        expect(chayGuard(muc.url, muc.quyen)).withContext(`phải vào được ${muc.url}`).toBe(true);

        PHAN_HE.filter((khac) => khac.quyen !== muc.quyen).forEach((khac) => {
          expect(chayGuard(khac.url, khac.quyen) === true)
            .withContext(`chỉ có ${muc.quyen} thì không được vào ${khac.url}`)
            .toBe(false);
        });
      });
    });

    it('tài khoản có đủ quyền vào được mọi phân hệ', () => {
      dungMoiTruong(hoSoTruyCap(PHAN_HE.map((muc) => muc.quyen)));
      PHAN_HE.forEach((muc) => {
        expect(chayGuard(muc.url, muc.quyen)).withContext(`phải vào được ${muc.url}`).toBe(true);
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('Route mặc định lấy từ menu do API trả về', () => {
    it('lấy mục menu đầu tiên có đường dẫn, kể cả khi nằm trong menu con', () => {
      dungMoiTruong(hoSoTruyCap(['dossier.view']));
      expect(TestBed.inject(AuthService).defaultRoute()).toBe('/declarations');
    });

    it('menu rỗng thì rơi về /profile', () => {
      dungMoiTruong(hoSoTruyCap(['dossier.view'], []));
      expect(TestBed.inject(AuthService).defaultRoute()).toBe('/profile');
    });

    it('trả về /login khi chưa đăng nhập', () => {
      dungMoiTruong();
      expect(TestBed.inject(AuthService).defaultRoute()).toBe('/login');
    });

    it('guestGuard đẩy về route mặc định khi đã đăng nhập', () => {
      dungMoiTruong(hoSoTruyCap(['fee.view'], [{ key: 'fee', label: 'Thu phí', icon: 'payments', route: '/fees/tax' }]));
      const ketQua = TestBed.runInInjectionContext(() => guestGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
      expect(duongDanCua(ketQua as UrlTree)).toBe('/fees/tax');
    });

    it('homeRedirectGuard đẩy về route mặc định khi đã đăng nhập', () => {
      dungMoiTruong(hoSoTruyCap(['dossier.view']));
      const ketQua = TestBed.runInInjectionContext(() =>
        homeRedirectGuard({} as ActivatedRouteSnapshot, { url: '/' } as RouterStateSnapshot),
      );
      expect(duongDanCua(ketQua as UrlTree)).toBe('/declarations');
    });
  });

  // ---------------------------------------------------------------------------
  describe('AuthService.hasPermission', () => {
    it('trả true khi có ít nhất một quyền trong danh sách yêu cầu', () => {
      dungMoiTruong(hoSoTruyCap(['dossier.view', 'dossier.create']));
      const auth = TestBed.inject(AuthService);
      expect(auth.hasPermission('dossier.create')).toBe(true);
      expect(auth.hasPermission(['system.view', 'dossier.view'])).toBe(true);
      expect(auth.hasPermission('system.delete')).toBe(false);
    });

    it('yêu cầu quyền rỗng thì từ chối (fail-closed) — "không ràng buộc" do authGuard tự xử lý', () => {
      dungMoiTruong(hoSoTruyCap(['dossier.view']));
      const auth = TestBed.inject(AuthService);
      expect(auth.hasPermission(null)).toBe(false);
      expect(auth.hasPermission(undefined)).toBe(false);
      expect(auth.hasPermission([])).toBe(false);
    });

    it('phiên đọc được từ sessionStorage khi không ghi nhớ đăng nhập', () => {
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap(['dossier.view']) }),
      );
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ApiService, useValue: {} }] });
      expect(TestBed.inject(AuthService).isAuthenticated()).toBe(true);
    });
  });
});
