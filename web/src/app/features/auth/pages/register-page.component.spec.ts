import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { ApiService, RegisterPayload } from '../../../core/services/api.service';
import { RegisterPageComponent } from './register-page.component';

/**
 * F00 — Đăng ký tự phục vụ (UI). Trọng tâm: FE chặn dữ liệu sai TRƯỚC khi gọi API,
 * thành công thì báo chờ duyệt, và lỗi trùng (409) hiện đúng câu do API trả.
 */

/** Lỗi HTTP 409 giả lập giống hình dạng API trả về (có `message` tiếng Việt + `messageKey`). */
function loi409(message: string, messageKey: string): Observable<never> {
  return throwError(() => ({ status: 409, error: { statusCode: 409, message, messageKey } }));
}

describe('RegisterPageComponent — đăng ký tự phục vụ', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<RegisterPageComponent>;
  let component: RegisterPageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function chuHienTrenManHinh(): string {
    return (fixture.nativeElement as HTMLElement).textContent || '';
  }

  /** Điền form với dữ liệu hợp lệ (mặc định tài khoản doanh nghiệp); overrides để cố tình làm sai một trường. */
  function dienForm(overrides: Partial<Record<string, string>> = {}): void {
    noiBo()['form'] = {
      accountType: 'ENTERPRISE',
      username: 'congty.a',
      password: 'MatKhau123',
      confirmPassword: 'MatKhau123',
      displayName: 'Công ty A',
      taxCode: '0101234567',
      representativeName: 'Nguyễn Văn A',
      idNumber: '',
      address: 'Số 1, đường A, TP B',
      email: 'a@congty.vn',
      phone: '0912345678',
      ...overrides,
    };
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['register']);
    api.register.and.returnValue(of({ registered: true }));

    TestBed.configureTestingModule({
      imports: [RegisterPageComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    fixture = TestBed.createComponent(RegisterPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ---------------------------------------------------------------------------
  describe('Chặn dữ liệu sai trước khi gọi API', () => {
    it('thiếu trường bắt buộc thì KHÔNG gọi register và nêu lỗi từng trường', () => {
      dienForm({ username: '', displayName: '', email: '', phone: '' });

      noiBo()['submit']();

      expect(api.register).not.toHaveBeenCalled();
      const errors = noiBo()['errors']();
      expect(errors.username).toBe('Vui lòng nhập tên đăng nhập.');
      // Mặc định là tài khoản doanh nghiệp nên thiếu tên báo theo doanh nghiệp.
      expect(errors.displayName).toBe('Vui lòng nhập tên doanh nghiệp.');
      expect(errors.email).toBe('Địa chỉ email không hợp lệ.');
      expect(errors.phone).toBe('Số điện thoại không hợp lệ.');
    });

    it('tên đăng nhập không hợp lệ (độ dài hoặc ký tự) thì bị chặn và báo lỗi rõ ràng', () => {
      // Độ dài < 3
      dienForm({ username: 'ab' });
      noiBo()['submit']();
      expect(api.register).not.toHaveBeenCalled();
      expect(noiBo()['errors']().username).toBe('Tên đăng nhập phải từ 3 đến 30 ký tự.');

      // Độ dài > 30
      dienForm({ username: 'a'.repeat(31) });
      noiBo()['submit']();
      expect(api.register).not.toHaveBeenCalled();
      expect(noiBo()['errors']().username).toBe('Tên đăng nhập phải từ 3 đến 30 ký tự.');

      // Chứa khoảng trắng / ký tự đặc biệt / tiếng Việt
      dienForm({ username: 'user name' });
      noiBo()['submit']();
      expect(api.register).not.toHaveBeenCalled();
      expect(noiBo()['errors']().username).toBe(
        'Tên đăng nhập không được chứa khoảng trắng, tiếng Việt có dấu hoặc ký tự đặc biệt (chỉ cho phép a-z, 0-9, _, -, .).',
      );

      dienForm({ username: 'tên_tiếng_việt' });
      noiBo()['submit']();
      expect(api.register).not.toHaveBeenCalled();
      expect(noiBo()['errors']().username).toBe(
        'Tên đăng nhập không được chứa khoảng trắng, tiếng Việt có dấu hoặc ký tự đặc biệt (chỉ cho phép a-z, 0-9, _, -, .).',
      );
    });

    it('mật khẩu nhập lại không khớp thì bị chặn, không gọi register', () => {
      dienForm({ confirmPassword: 'KhacHan999' });

      noiBo()['submit']();

      expect(api.register).not.toHaveBeenCalled();
      expect(noiBo()['errors']().confirmPassword).toBe('Mật khẩu nhập lại không khớp.');
    });

    it('mật khẩu yếu thì bị chặn, không gọi register', () => {
      dienForm({ password: '123', confirmPassword: '123' });

      noiBo()['submit']();

      expect(api.register).not.toHaveBeenCalled();
      expect(noiBo()['errors']().password).toBe(
        'Mật khẩu phải có tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt ',
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('Gửi đăng ký', () => {
    it('doanh nghiệp: gọi register với payload đã cắt khoảng trắng, kèm mã số thuế', () => {
      dienForm({ username: '  congty.a  ', displayName: '  Công ty A  ', taxCode: '  0101234567  ', email: '  a@congty.vn  ', phone: '  0912345678  ' });

      noiBo()['submit']();

      const payload: RegisterPayload = {
        accountType: 'ENTERPRISE',
        username: 'congty.a',
        password: 'MatKhau123',
        displayName: 'Công ty A',
        email: 'a@congty.vn',
        phone: '0912345678',
        address: 'Số 1, đường A, TP B',
        taxCode: '0101234567',
        representativeName: 'Nguyễn Văn A',
      };
      expect(api.register).toHaveBeenCalledOnceWith(payload);
    });

    it('cá nhân: gọi register kèm số CCCD/hộ chiếu + địa chỉ, KHÔNG kèm mã số thuế/người đại diện', () => {
      dienForm({ accountType: 'INDIVIDUAL', displayName: 'Nguyễn Văn A', idNumber: '012345678901' });

      noiBo()['submit']();

      const payload: RegisterPayload = {
        accountType: 'INDIVIDUAL',
        username: 'congty.a',
        password: 'MatKhau123',
        displayName: 'Nguyễn Văn A',
        email: 'a@congty.vn',
        phone: '0912345678',
        address: 'Số 1, đường A, TP B',
        idNumber: '012345678901',
      };
      expect(api.register).toHaveBeenCalledOnceWith(payload);
    });

    it('doanh nghiệp thiếu mã số thuế thì bị chặn, không gọi register', () => {
      dienForm({ taxCode: '' });

      noiBo()['submit']();

      expect(api.register).not.toHaveBeenCalled();
      expect(noiBo()['errors']().taxCode).toBe('Vui lòng nhập mã số thuế (10–14 ký tự).');
    });

    it('cá nhân thiếu số CCCD thì bị chặn, không gọi register', () => {
      dienForm({ accountType: 'INDIVIDUAL', displayName: 'Nguyễn Văn A', idNumber: '' });

      noiBo()['submit']();

      expect(api.register).not.toHaveBeenCalled();
      expect(noiBo()['errors']().idNumber).toBe('Vui lòng nhập số CCCD/hộ chiếu.');
    });

    it('cá nhân nhập CCCD dưới 6 ký tự thì báo lỗi định dạng (6–50 ký tự)', () => {
      dienForm({ accountType: 'INDIVIDUAL', displayName: 'Nguyễn Văn A', idNumber: '123' });

      noiBo()['submit']();

      expect(api.register).not.toHaveBeenCalled();
      expect(noiBo()['errors']().idNumber).toBe('Số CCCD/hộ chiếu không đúng định dạng (6–50 ký tự).');
    });

    it('thành công thì hiện thông báo CHỜ DUYỆT, ẩn form và tắt loading', () => {
      dienForm();

      noiBo()['submit']();
      fixture.detectChanges();

      expect(noiBo()['success']()).toBe(true);
      expect(noiBo()['loading']()).toBe(false);
      expect(chuHienTrenManHinh()).toContain('Đăng ký thành công, tài khoản đang chờ duyệt.');
      // Form ẩn đi: không còn nút "Đăng ký".
      expect((fixture.nativeElement as HTMLElement).querySelector('button[type="submit"]')).toBeNull();
    });

    it('trùng username (409) thì hiện đúng câu trùng do API trả, không đặt success', () => {
      api.register.and.returnValue(loi409('Tên đăng nhập đã tồn tại.', 'auth.registerDuplicateUsername'));
      dienForm();

      noiBo()['submit']();
      fixture.detectChanges();

      expect(noiBo()['success']()).toBe(false);
      expect(noiBo()['loading']()).toBe(false);
      expect(noiBo()['errors']().username).toBe('Tên đăng nhập đã tồn tại.');
      expect(chuHienTrenManHinh()).toContain('Tên đăng nhập đã tồn tại.');
    });

    it('trùng mã số thuế (409) thì khoanh đỏ và hiện Mã số thuế đã tồn tại.', () => {
      api.register.and.returnValue(loi409('Mã số thuế đã tồn tại.', 'auth.registerDuplicateTaxCode'));
      dienForm();

      noiBo()['submit']();
      fixture.detectChanges();

      expect(noiBo()['errors']().taxCode).toBe('Mã số thuế đã tồn tại.');
      expect(chuHienTrenManHinh()).toContain('Mã số thuế đã tồn tại.');
    });

    it('trùng CCCD (409) thì khoanh đỏ và hiện CCCD đã tồn tại.', () => {
      api.register.and.returnValue(loi409('CCCD đã tồn tại.', 'auth.registerDuplicateIdNumber'));
      dienForm({ accountType: 'INDIVIDUAL', idNumber: '012345678901' });

      noiBo()['submit']();
      fixture.detectChanges();

      expect(noiBo()['errors']().idNumber).toBe('CCCD đã tồn tại.');
      expect(chuHienTrenManHinh()).toContain('CCCD đã tồn tại.');
    });

    it('trùng thư điện tử (409) thì khoanh đỏ và hiện Thư điện tử đã tồn tại.', () => {
      api.register.and.returnValue(loi409('Thư điện tử đã tồn tại.', 'auth.registerDuplicateEmail'));
      dienForm();

      noiBo()['submit']();
      fixture.detectChanges();

      expect(noiBo()['errors']().email).toBe('Thư điện tử đã tồn tại.');
      expect(chuHienTrenManHinh()).toContain('Thư điện tử đã tồn tại.');
    });

    it('đang gửi thì bấm lần nữa không gọi API thêm', () => {
      // register không phát giá trị ngay → loading giữ true.
      api.register.and.returnValue(new Observable<{ registered: true }>(() => undefined));
      dienForm();

      noiBo()['submit']();
      noiBo()['submit']();

      expect(api.register).toHaveBeenCalledTimes(1);
      expect(noiBo()['loading']()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Đồng ý điều khoản (ràng buộc client-side thuần)', () => {
    /** Ô đồng ý điều khoản — control reactive riêng, không nằm trong `form`. */
    function terms(): { value: boolean; invalid: boolean; touched: boolean; setValue: (v: boolean) => void; markAsTouched: () => void } {
      return noiBo()['termsControl'];
    }

    function nutDangKy(): HTMLButtonElement | null {
      return (fixture.nativeElement as HTMLElement).querySelector('button[type="submit"]');
    }

    it('mặc định chưa tick thì control không hợp lệ và nút Đăng ký bị vô hiệu', () => {
      expect(terms().value).toBe(false);
      expect(terms().invalid).toBe(true);
      // requiredTrue: nút khóa tới khi tự tick.
      expect(nutDangKy()?.disabled).toBe(true);
    });

    it('chưa tick nhưng đã chạm vào ô thì hiện thông báo bắt buộc đồng ý', () => {
      terms().markAsTouched();
      fixture.detectChanges();

      expect(chuHienTrenManHinh()).toContain('Vui lòng đồng ý với điều khoản sử dụng để tiếp tục.');
    });

    it('chưa chạm vào ô thì KHÔNG hiện thông báo (chỉ báo khi touched)', () => {
      expect(terms().touched).toBe(false);
      expect(chuHienTrenManHinh()).not.toContain('Vui lòng đồng ý với điều khoản sử dụng để tiếp tục.');
    });

    it('tick đồng ý thì control hợp lệ và nút Đăng ký bật lại', () => {
      terms().setValue(true);
      fixture.detectChanges();

      expect(terms().invalid).toBe(false);
      expect(nutDangKy()?.disabled).toBe(false);
    });

    it('payload gửi BE KHÔNG chứa trường terms (giữ nguyên contract POST /auth/register)', () => {
      terms().setValue(true);
      dienForm();

      noiBo()['submit']();

      expect(api.register).toHaveBeenCalledTimes(1);
      const payload = api.register.calls.mostRecent().args[0] as unknown as Record<string, unknown>;
      expect(Object.hasOwn(payload, 'terms')).toBe(false);
      expect(Object.keys(payload)).not.toContain('terms');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Liên kết điều khoản và giải thích nút bị vô hiệu', () => {
    function nutDangKy(): HTMLButtonElement | null {
      return (fixture.nativeElement as HTMLElement).querySelector('button[type="submit"]');
    }

    it('dòng đồng ý có 2 liên kết Điều khoản sử dụng và Chính sách bảo mật (BUG-077)', () => {
      const links = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.terms-link'),
      );
      expect(links.length).toBe(2);
      expect(links[0].textContent).toContain('Điều khoản sử dụng');
      expect(links[1].textContent).toContain('Chính sách bảo mật');
    });

    it('bấm liên kết mở hộp thoại điều khoản mà KHÔNG đổi trạng thái ô tích (BUG-077)', () => {
      const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.terms-link');
      link?.click();
      fixture.detectChanges();

      expect(noiBo()['termsOpen']()).toBe(true);
      // Ô đồng ý không bị vô tình tick khi bấm liên kết bên trong nhãn.
      expect(noiBo()['termsControl'].value).toBe(false);
      expect(chuHienTrenManHinh()).toContain('Điều khoản sử dụng và Chính sách bảo mật');
    });

    it('chưa tích điều khoản thì hiện dòng giải thích lý do nút bị vô hiệu (BUG-078)', () => {
      expect(nutDangKy()?.disabled).toBe(true);
      expect(chuHienTrenManHinh()).toContain('để bật nút Đăng ký');
    });

    it('tích điều khoản thì ẩn dòng giải thích và bật nút', () => {
      noiBo()['termsControl'].setValue(true);
      fixture.detectChanges();

      expect(nutDangKy()?.disabled).toBe(false);
      expect(chuHienTrenManHinh()).not.toContain('để bật nút Đăng ký');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Panel hero — 3 thẻ lợi ích', () => {
    it('thẻ lợi ích thứ 3 có tiêu đề riêng, không trùng phụ đề thẻ 2 (BUG-076)', () => {
      const titles = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.benefit .t1'),
      ).map((el) => (el.textContent || '').trim());
      const subs = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.benefit .t2'),
      ).map((el) => (el.textContent || '').trim());

      expect(titles[2]).toBe('Bảo mật thông tin cấp độ 3');
      expect(titles[2]).not.toBe(subs[1]);
    });
  });
  describe('API error handling', () => {
    it('lỗi backend mảng errors: đánh dấu lỗi dưới từng trường', () => {
      const err = throwError(() => ({ status: 409, error: { messageKey: 'test', errors: [{ field: 'username', messageKey: 'auth.registerDuplicateUsername', message: 'Tên đăng nhập đã tồn tại.' }, { field: 'email', messageKey: 'auth.registerDuplicateEmail', message: 'Email đã tồn tại.' }] } }));
      api.register.and.returnValue(err);
      dienForm();

      noiBo()['submit']();
      fixture.detectChanges();

      expect(noiBo()['errors']().username).toBe('Tên đăng nhập đã tồn tại.');
      expect(noiBo()['errors']().email).toBe('Thư điện tử đã tồn tại.');
    });

    it('lỗi backend ngoài danh sách field: toast chung', () => {
      const err = throwError(() => ({ status: 409, error: { messageKey: 'test', errors: [{ field: 'unmappedField', message: 'Lỗi lạ từ server' }] } }));
      api.register.and.returnValue(err);
      spyOn(noiBo(), 'notify');
      dienForm();

      noiBo()['submit']();
      fixture.detectChanges();

      expect(noiBo()['notify']).toHaveBeenCalledWith('Lỗi lạ từ server', 'error');
    });
  });
});
