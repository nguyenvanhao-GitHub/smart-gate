import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { I18nService, LOCALE_STORAGE_KEY } from '../../../core/i18n/i18n.service';
import { LoginPageComponent } from './login-page.component';

/**
 * Đổi ngôn ngữ phải làm **giao diện tự vẽ lại**, không tải lại trang: hàm dịch đọc signal ngôn ngữ
 * nên template là "người tiêu thụ" của signal đó.
 */
describe('Đăng nhập — đổi ngôn ngữ tại chỗ', () => {
  let fixture: ComponentFixture<LoginPageComponent>;
  let i18n: I18nService;

  function chuTrenMan(): string {
    return (fixture.nativeElement as HTMLElement).textContent || '';
  }

  beforeEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    const auth = jasmine.createSpyObj<AuthService>('AuthService', ['login', 'defaultRoute']);
    auth.defaultRoute.and.returnValue('/declarations');

    TestBed.configureTestingModule({
      imports: [LoginPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    });
    i18n = TestBed.inject(I18nService);
    fixture = TestBed.createComponent(LoginPageComponent);
    fixture.detectChanges();
  });

  afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));

  it('mặc định hiển thị tiếng Việt', () => {
    expect(chuTrenMan()).toContain('Đăng nhập hệ thống');
    expect(chuTrenMan()).toContain('Ghi nhớ đăng nhập');
  });

  it('đổi sang tiếng Anh thì nhãn đổi theo mà KHÔNG dựng lại component', () => {
    const truoc = fixture.componentInstance;

    i18n.setLocale('en');
    fixture.detectChanges();

    expect(fixture.componentInstance).toBe(truoc, 'component phải là cùng một thực thể — không tải lại trang');
    expect(chuTrenMan()).toContain('Sign in');
    expect(chuTrenMan()).toContain('Remember me');
    expect(chuTrenMan()).not.toContain('Ghi nhớ đăng nhập');
  });

  it('đổi ngược lại tiếng Việt cũng vẽ lại ngay', () => {
    i18n.setLocale('en');
    fixture.detectChanges();
    i18n.setLocale('vi');
    fixture.detectChanges();

    expect(chuTrenMan()).toContain('Đăng nhập hệ thống');
    expect(chuTrenMan()).not.toContain('Sign in');
  });

  it('không bao giờ hiện khóa dịch ra màn hình', () => {
    i18n.setLocale('en');
    fixture.detectChanges();

    expect(chuTrenMan()).not.toContain('ui.login.');
    expect(chuTrenMan()).not.toContain('ui.shell.');
  });
});
