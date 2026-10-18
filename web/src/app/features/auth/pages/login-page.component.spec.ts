import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AccessProfile } from '../../../core/auth/access-control.model';
import { AuthService } from '../../../core/auth/auth.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { LoginPageComponent } from './login-page.component';

/**
 * UI-01 Đăng nhập. Yêu cầu bảo mật: sai tài khoản hay sai mật khẩu đều chỉ hiện
 * MỘT thông báo chung — không được để lộ tài khoản có tồn tại trong hệ thống hay không.
 */

const THONG_BAO_CHUNG = 'Tên đăng nhập hoặc mật khẩu không đúng.';

function hoSoTruyCap(): AccessProfile {
  return {
    user: {
      id: 'u-1',
      username: 'nguyenvana',
      displayName: 'Nguyễn Văn A',
      title: 'Chuyên viên',
      email: 'a@chc.gov.vn',
      phone: '0900000000',
      status: 'ACTIVE',
      organization: null,
    },
    roles: [{ code: 'VAI_TRO_TEST', name: 'Vai trò thử nghiệm', dataScope: 'ORGANIZATION' }],
    permissions: ['dossier.view'],
    assignments: [],
    menu: [{ key: 'dossier', label: 'Hồ sơ', icon: 'description', route: '/declarations' }],
  };
}

/** Lỗi HTTP giả lập theo mã trạng thái API trả về. */
function loiHttp(status: number, messageKey?: string) {
  return throwError(() => ({ status, error: { messageKey, message: 'loi' } }));
}

describe('LoginPageComponent — đăng nhập', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let router: Router;
  let fixture: ComponentFixture<LoginPageComponent>;
  let component: LoginPageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function dungMoiTruong(returnUrl?: string): void {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['login', 'defaultRoute']);
    auth.defaultRoute.and.returnValue('/declarations');

    TestBed.configureTestingModule({
      imports: [LoginPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}) } },
        },
      ],
    });
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    fixture = TestBed.createComponent(LoginPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function nhapVaGui(username: string, password: string, remember = false): void {
    noiBo()['username'] = username;
    noiBo()['password'] = password;
    noiBo()['remember'] = remember;
    noiBo()['submit']();
    fixture.detectChanges();
  }

  /** Toast lỗi mới nhất đang hiển thị. */
  function toastLoiMoiNhat(): string {
    const loi = TestBed.inject(AppMessageService).messages().filter((m) => m.tone === 'error');
    return loi.length ? loi[loi.length - 1].text : '';
  }

  // ---------------------------------------------------------------------------
  describe('Không tiết lộ thông tin tài khoản', () => {
    it('sai mật khẩu (401) hiện thông báo chung', () => {
      dungMoiTruong();
      auth.login.and.returnValue(loiHttp(401));

      nhapVaGui('nguyenvana', 'sai-mat-khau');

      expect(toastLoiMoiNhat()).toBe(THONG_BAO_CHUNG);
    });

    it('tài khoản không tồn tại (404) hiện đúng thông báo chung đó', () => {
      dungMoiTruong();
      auth.login.and.returnValue(loiHttp(404));

      nhapVaGui('khong-ton-tai', 'mat-khau-bat-ky');

      expect(toastLoiMoiNhat()).toBe(THONG_BAO_CHUNG);
    });

    it('tài khoản bị khóa (403) cũng chỉ hiện thông báo chung', () => {
      dungMoiTruong();
      auth.login.and.returnValue(loiHttp(403));

      nhapVaGui('bikhoa', 'mat-khau-dung');

      expect(toastLoiMoiNhat()).toBe(THONG_BAO_CHUNG);
    });

    it('thông báo không chứa tên đăng nhập vừa nhập và không nói tài khoản có tồn tại hay không', () => {
      dungMoiTruong();
      auth.login.and.returnValue(loiHttp(401));

      nhapVaGui('nguyenvana', 'sai-mat-khau');

      const thongBao = toastLoiMoiNhat();
      expect(thongBao).not.toContain('nguyenvana');
      expect(thongBao.toLowerCase()).not.toContain('tồn tại');
      expect(thongBao.toLowerCase()).not.toContain('khóa');
    });

    it('đăng nhập thất bại thì xóa mật khẩu đã nhập nhưng giữ tên đăng nhập', () => {
      dungMoiTruong();
      auth.login.and.returnValue(loiHttp(401));

      nhapVaGui('nguyenvana', 'sai-mat-khau');

      expect(noiBo()['password']).toBe('');
      expect(noiBo()['username']).toBe('nguyenvana');
      expect(noiBo()['loading']()).toBe(false);
    });

    it('đăng nhập thất bại thì không điều hướng đi đâu cả', () => {
      dungMoiTruong('/declarations');
      auth.login.and.returnValue(loiHttp(401));

      nhapVaGui('nguyenvana', 'sai-mat-khau');

      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Kiểm tra dữ liệu nhập', () => {
    it('bỏ trống tên đăng nhập thì không gọi API', () => {
      dungMoiTruong();
      nhapVaGui('   ', 'mat-khau');

      expect(auth.login).not.toHaveBeenCalled();
      expect(toastLoiMoiNhat()).toBe('Vui lòng nhập tên đăng nhập và mật khẩu.');
    });

    it('bỏ trống mật khẩu thì không gọi API', () => {
      dungMoiTruong();
      nhapVaGui('nguyenvana', '');

      expect(auth.login).not.toHaveBeenCalled();
      expect(toastLoiMoiNhat()).toBe('Vui lòng nhập tên đăng nhập và mật khẩu.');
    });

    it('cắt khoảng trắng thừa của tên đăng nhập và giữ nguyên lựa chọn ghi nhớ', () => {
      dungMoiTruong();
      auth.login.and.returnValue(of(hoSoTruyCap()));

      nhapVaGui('  nguyenvana  ', 'mat-khau-dung', true);

      expect(auth.login).toHaveBeenCalledOnceWith('nguyenvana', 'mat-khau-dung', true);
    });

    it('đang gửi yêu cầu thì bấm đăng nhập lần nữa không gửi thêm', () => {
      dungMoiTruong();
      auth.login.and.returnValue(new Subject<AccessProfile>().asObservable());

      nhapVaGui('nguyenvana', 'mat-khau-dung');
      nhapVaGui('nguyenvana', 'mat-khau-dung');

      expect(auth.login).toHaveBeenCalledTimes(1);
      expect(noiBo()['loading']()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Ghi nhớ đăng nhập (BUG-094)', () => {
    it('mặc định ô "Ghi nhớ đăng nhập" được tích sẵn', async () => {
      dungMoiTruong();
      // ngModel phản chiếu giá trị vào ô tích qua microtask — chờ ổn định trước khi đọc DOM.
      await fixture.whenStable();
      fixture.detectChanges();

      expect(noiBo()['remember']).toBe(true);
      const checkbox = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('.remember input');
      expect(checkbox?.checked).toBe(true);
    });

    it('giữ nguyên lựa chọn ghi nhớ mặc định khi đăng nhập', () => {
      dungMoiTruong();
      auth.login.and.returnValue(of(hoSoTruyCap()));

      noiBo()['username'] = 'nguyenvana';
      noiBo()['password'] = 'mat-khau-dung';
      noiBo()['submit']();

      expect(auth.login).toHaveBeenCalledOnceWith('nguyenvana', 'mat-khau-dung', true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Đăng nhập thành công', () => {
    it('quay lại đúng trang đang làm dở theo returnUrl', () => {
      dungMoiTruong('/fees/tax?trang=2');
      auth.login.and.returnValue(of(hoSoTruyCap()));

      nhapVaGui('nguyenvana', 'mat-khau-dung');

      expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/fees/tax?trang=2');
      expect(noiBo()['loading']()).toBe(false);
    });

    it('không có returnUrl thì về route mặc định lấy từ menu của API', () => {
      dungMoiTruong();
      auth.login.and.returnValue(of(hoSoTruyCap()));

      nhapVaGui('nguyenvana', 'mat-khau-dung');

      expect(auth.defaultRoute).toHaveBeenCalled();
      expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/declarations');
    });

    it('gửi lại thành công thì đăng nhập được và điều hướng đi', () => {
      dungMoiTruong();
      auth.login.and.returnValue(loiHttp(401));
      nhapVaGui('nguyenvana', 'sai');
      expect(toastLoiMoiNhat()).toBe(THONG_BAO_CHUNG);

      auth.login.and.returnValue(of(hoSoTruyCap()));
      nhapVaGui('nguyenvana', 'dung');
      expect(router.navigateByUrl).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Quên mật khẩu (SG-140 & SG-102)', () => {
    it('mở popup Quên mật khẩu và kiểm tra validation email', () => {
      dungMoiTruong();

      // Mở modal
      noiBo()['forgotPassword']();
      fixture.detectChanges();
      expect(noiBo()['forgotModalOpen']()).toBe(true);

      // Validation 1: Email để trống
      noiBo()['forgotEmail'] = '   ';
      noiBo()['submitForgotPassword']();
      expect(noiBo()['forgotEmailError']()).toBe('Nhập email');

      // Validation 2: Email sai định dạng
      noiBo()['forgotEmail'] = 'sai-dinh-dang';
      noiBo()['submitForgotPassword']();
      expect(noiBo()['forgotEmailError']()).toBe('Email sai định dạng');

      // Validation 3: Email không tồn tại trên hệ thống
      noiBo()['forgotEmail'] = 'notfound@chc.gov.vn';
      noiBo()['submitForgotPassword']();
      expect(noiBo()['forgotGeneralError']()).toBe('Email không tồn tại trên hệ thống');

      // Validation 4: Email hợp lệ -> gửi mật khẩu mới và đóng popup
      noiBo()['forgotEmail'] = 'admin@chc.gov.vn';
      noiBo()['submitForgotPassword']();
      fixture.detectChanges();

      expect(noiBo()['forgotModalOpen']()).toBe(false);
      expect(fixture.nativeElement.textContent).toContain('Mật khẩu mới đã được gửi về mail của bạn');
    });

    it('đóng popup khi bấm Hủy hoặc close', () => {
      dungMoiTruong();
      noiBo()['forgotPassword']();
      expect(noiBo()['forgotModalOpen']()).toBe(true);

      noiBo()['closeForgotModal']();
      expect(noiBo()['forgotModalOpen']()).toBe(false);
    });
  });
});
