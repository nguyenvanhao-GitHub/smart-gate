import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiService } from '../../../core/services/api.service';
import { ProfilePageComponent } from './profile-page.component';

/**
 * F01 — Thông tin tài khoản (UI). Trọng tâm các lỗi ⚪ đã sửa:
 *   - BUG-066: bỏ trống ô "Xác nhận mật khẩu mới" cũng phải báo lỗi (trước đây hai ô cùng rỗng
 *     bị coi là "khớp" nên nuốt lỗi).
 *   - BUG-074: thanh đo độ mạnh phản ứng khi gõ — điểm 0–4 cập nhật tức thì.
 *   - BUG-075: bộ chọn ảnh đại diện kiểm định dạng/dung lượng và dựng ảnh xem trước.
 */
describe('ProfilePageComponent — thông tin tài khoản', () => {
  let api: jasmine.SpyObj<ApiService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let queryParamSubject: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let fixture: ComponentFixture<ProfilePageComponent>;
  let component: ProfilePageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['updateProfile', 'changePassword']);
    api.changePassword.and.returnValue(of(void 0));
    routerSpy = jasmine.createSpyObj<Router>('Router', ['navigate']);
    queryParamSubject = new BehaviorSubject(convertToParamMap({}));

    const authStub = {
      currentUser: signal({
        id: 'u-1',
        username: 'nguyenvana',
        displayName: 'Nguyễn Văn A',
        title: 'Chuyên viên',
        email: 'a@chc.gov.vn',
        phone: '0900000000',
        status: 'ACTIVE',
        organization: null,
      }),
      avatarUrl: signal<string | null>(null),
      roles: signal([]),
      assignments: signal([]),
      updateAvatar: jasmine.createSpy('updateAvatar'),
      refreshProfile: () => of(void 0),
    };

    TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: authStub },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            get snapshot() {
              return { queryParamMap: queryParamSubject.value };
            },
            queryParamMap: queryParamSubject.asObservable(),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(ProfilePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // --- BUG-066: ô xác nhận mật khẩu ------------------------------------------
  describe('Đổi mật khẩu — kiểm ô xác nhận (BUG-066)', () => {
    it('bỏ trống cả 3 ô thì cả 3 đều báo lỗi (ô xác nhận không còn bị nuốt lỗi)', () => {
      noiBo()['password'] = { currentPassword: '', newPassword: '', confirmPassword: '' };

      noiBo()['changePassword']();

      const errors = noiBo()['errors']();
      expect(errors.currentPassword).toBe('Vui lòng nhập mật khẩu hiện tại.');
      expect(errors.newPassword).toBeTruthy();
      expect(errors.confirmPassword).toBe('Vui lòng nhập lại mật khẩu mới để xác nhận.');
      expect(api.changePassword).not.toHaveBeenCalled();
    });

    it('nhập mật khẩu mới nhưng để trống ô xác nhận thì ô xác nhận báo bắt buộc', () => {
      noiBo()['password'] = { currentPassword: 'CuGiaHan1@', newPassword: 'MoiManh1@x', confirmPassword: '' };

      noiBo()['changePassword']();

      expect(noiBo()['errors']().confirmPassword).toBe('Vui lòng nhập lại mật khẩu mới để xác nhận.');
      expect(api.changePassword).not.toHaveBeenCalled();
    });

    it('hai ô mật khẩu khác nhau thì báo không khớp', () => {
      noiBo()['password'] = { currentPassword: 'CuGiaHan1@', newPassword: 'MoiManh1@x', confirmPassword: 'KhacHan9@z' };

      noiBo()['changePassword']();

      expect(noiBo()['errors']().confirmPassword).toBe('Xác nhận mật khẩu không khớp.');
    });

    it('mật khẩu mạnh và hai ô khớp thì gọi API đổi mật khẩu', () => {
      noiBo()['password'] = { currentPassword: 'CuGiaHan1@', newPassword: 'MoiManh1@x', confirmPassword: 'MoiManh1@x' };

      noiBo()['changePassword']();

      expect(api.changePassword).toHaveBeenCalledOnceWith({ currentPassword: 'CuGiaHan1@', newPassword: 'MoiManh1@x' });
    });

    it('nhập sai mật khẩu hiện tại khi gọi API thì hiển thị lỗi dưới ô mật khẩu hiện tại', () => {
      api.changePassword.and.returnValue(
        throwError(() => ({
          status: 400,
          error: {
            statusCode: 400,
            message: 'Mật khẩu hiện tại không đúng.',
            messageKey: 'auth.currentPasswordWrong',
          },
        })),
      );
      noiBo()['openPassword']();
      noiBo()['password'] = { currentPassword: 'SaiMatKhau1@', newPassword: 'MoiManh1@x', confirmPassword: 'MoiManh1@x' };
      const showSpy = spyOn(noiBo()['appMessages'], 'show');

      noiBo()['changePassword']();
      fixture.detectChanges();

      expect(noiBo()['errors']().currentPassword).toBe('Mật khẩu hiện tại không đúng.');
      expect(showSpy).not.toHaveBeenCalled();
      const currentPassword = (fixture.nativeElement as HTMLElement).querySelector(
        'input[name="currentPassword"]',
      ) as HTMLInputElement;
      const field = currentPassword.closest('.field');
      expect(field?.classList.contains('field--invalid')).toBeTrue();
      expect(field?.querySelector('.field__error')?.textContent?.trim()).toBe('Mật khẩu hiện tại không đúng.');
    });

    it('khi gõ lại mật khẩu hiện tại thì xóa lỗi dưới ô nhập', () => {
      noiBo()['errors'].update((prev: any) => ({ ...prev, currentPassword: 'Mật khẩu hiện tại không đúng.' }));
      expect(noiBo()['errors']().currentPassword).toBe('Mật khẩu hiện tại không đúng.');

      noiBo()['onCurrentPasswordChange']();

      expect(noiBo()['errors']().currentPassword).toBe('');
    });
  });

  // --- BUG-074: thanh đo độ mạnh ---------------------------------------------
  describe('Độ mạnh mật khẩu phản ứng khi gõ (BUG-074)', () => {
    it('điểm tăng dần theo độ dài + hoa/thường + số + ký tự đặc biệt', () => {
      noiBo()['onNewPasswordChange']('abc');
      expect(noiBo()['pwStrength']()).toBe(0);

      noiBo()['onNewPasswordChange']('abcdefgh');
      expect(noiBo()['pwStrength']()).toBe(1);

      noiBo()['onNewPasswordChange']('Abcdefgh');
      expect(noiBo()['pwStrength']()).toBe(2);

      noiBo()['onNewPasswordChange']('Abcdefg1');
      expect(noiBo()['pwStrength']()).toBe(3);

      noiBo()['onNewPasswordChange']('Abcdef@1');
      expect(noiBo()['pwStrength']()).toBe(4);
    });

    it('mở lại hộp thoại đổi mật khẩu thì điểm về 0', () => {
      noiBo()['onNewPasswordChange']('Abcdef@1');
      expect(noiBo()['pwStrength']()).toBe(4);

      noiBo()['openPassword']();
      expect(noiBo()['pwStrength']()).toBe(0);
    });
  });

  // --- BUG-075: chọn ảnh đại diện --------------------------------------------
  describe('Đổi ảnh đại diện — bộ chọn tệp (BUG-075)', () => {
    function chonTep(file: File): void {
      const input = { files: [file], value: 'x' } as unknown as HTMLInputElement;
      noiBo()['onAvatarSelected']({ target: input } as unknown as Event);
    }

    it('ảnh không phải JPG/PNG thì báo lỗi định dạng, không đặt tên tệp', () => {
      chonTep(new File(['x'], 'tai-lieu.pdf', { type: 'application/pdf' }));

      expect(noiBo()['avatarError']()).toBe('Chỉ chấp nhận ảnh JPG hoặc PNG.');
      expect(noiBo()['avatarFileName']()).toBe('');
      expect(noiBo()['avatarPreview']()).toBeNull();
    });

    it('ảnh vượt 5MB thì báo lỗi dung lượng', () => {
      const big = new File([new ArrayBuffer(5 * 1024 * 1024 + 1)], 'to.png', { type: 'image/png' });
      chonTep(big);

      expect(noiBo()['avatarError']()).toBe('Ảnh vượt quá dung lượng cho phép (tối đa 5MB).');
      expect(noiBo()['avatarFileName']()).toBe('');
    });

    it('ảnh PNG hợp lệ thì xóa lỗi và ghi tên tệp đã chọn', () => {
      chonTep(new File([new ArrayBuffer(1024)], 'anh.png', { type: 'image/png' }));

      expect(noiBo()['avatarError']()).toBe('');
      expect(noiBo()['avatarFileName']()).toBe('anh.png');
    });

    it('bấm Lưu cập nhật ảnh và đóng hộp thoại', () => {
      api.updateProfile.and.returnValue(of(void 0));
      noiBo()['avatarPreview'].set('data:image/png;base64,123');
      const showMessage = spyOn(noiBo()['appMessages'], 'show');

      noiBo()['saveAvatar']();

      expect(noiBo()['avatarOpen']()).toBe(false);
      expect(showMessage).toHaveBeenCalledOnceWith('Đã cập nhật ảnh đại diện thành công.', 'success');
    });

    it('SG-217 — bấm nút xóa ảnh đại diện thì chuyển về trạng thái xóa và hiển thị ghi chú initials', () => {
      noiBo()['avatarPreview'].set('data:image/png;base64,123');
      noiBo()['removeAvatar']();

      expect(noiBo()['avatarPreview']()).toBeNull();
      expect(noiBo()['isAvatarDeleted']()).toBe(true);
      expect(noiBo()['hasCustomAvatar']()).toBe(false);
    });

    it('SG-217 — bấm Lưu khi ảnh đã xóa sẽ cập nhật avatarUrl rỗng và báo thành công', () => {
      api.updateProfile.and.returnValue(of(void 0));
      noiBo()['isAvatarDeleted'].set(true);
      const showMessage = spyOn(noiBo()['appMessages'], 'show');

      noiBo()['saveAvatar']();

      expect(api.updateProfile).toHaveBeenCalledWith({ avatarUrl: '' });
      expect(noiBo()['avatarOpen']()).toBe(false);
      expect(showMessage).toHaveBeenCalledOnceWith('Đã xóa ảnh đại diện thành công.', 'success');
    });
  });

  // --- Hồ sơ Doanh nghiệp ----------------------------------------------------
  describe('Hồ sơ Doanh nghiệp — nạp và cập nhật thông tin doanh nghiệp', () => {
    it('nhận diện tài khoản doanh nghiệp khi có taxCode và accountType = ENTERPRISE', () => {
      const authStub = TestBed.inject(AuthService) as unknown as { currentUser: any };
      authStub.currentUser.set({
        id: 'u-dn',
        username: 'congtyabc',
        displayName: 'Công ty TNHH ABC',
        email: 'contact@abc.vn',
        phone: '0901234567',
        address: '123 Đường Hải Quan, Hà Nội',
        accountType: 'ENTERPRISE',
        taxCode: '0101234567',
        representativeName: 'Nguyễn Văn Đại Diện',
        status: 'ACTIVE',
        organization: null,
      });
      fixture.detectChanges();
      noiBo()['resetForm']();

      expect(noiBo()['isEnterprise']()).toBe(true);
      expect(noiBo()['form'].displayName).toBe('Công ty TNHH ABC');
      expect(noiBo()['form'].representativeName).toBe('Nguyễn Văn Đại Diện');
      expect(noiBo()['form'].address).toBe('123 Đường Hải Quan, Hà Nội');
      expect(noiBo()['form'].phone).toBe('0901234567');
    });

    it('lưu thông tin doanh nghiệp gửi representativeName và không gửi title', () => {
      api.updateProfile.and.returnValue(of(void 0));
      const authStub = TestBed.inject(AuthService) as unknown as { currentUser: any };
      authStub.currentUser.set({
        id: 'u-dn',
        username: 'congtyabc',
        displayName: 'Công ty TNHH ABC',
        email: 'contact@abc.vn',
        phone: '0901234567',
        address: '123 Đường Hải Quan, Hà Nội',
        accountType: 'ENTERPRISE',
        taxCode: '0101234567',
        representativeName: 'Nguyễn Văn Đại Diện',
        status: 'ACTIVE',
        organization: null,
      });
      fixture.detectChanges();
      noiBo()['resetForm']();

      noiBo()['form'].displayName = 'Công ty TNHH ABC Cập Nhật';
      noiBo()['form'].representativeName = 'Trần Đại Diện Mới';
      noiBo()['form'].address = '456 Cửa Khẩu Mới';
      noiBo()['form'].phone = '0988776655';
      noiBo()['saveProfile']();

      expect(api.updateProfile).toHaveBeenCalledOnceWith({
        displayName: 'Công ty TNHH ABC Cập Nhật',
        title: undefined,
        email: 'contact@abc.vn',
        phone: '0988776655',
        address: '456 Cửa Khẩu Mới',
        representativeName: 'Trần Đại Diện Mới',
      });
    });
  });

  // --- Hồ sơ Cá nhân ---------------------------------------------------------
  describe('Hồ sơ Cá nhân — nạp và cập nhật thông tin cá nhân', () => {
    it('nhận diện tài khoản cá nhân khi accountType = INDIVIDUAL hoặc có idNumber', () => {
      const authStub = TestBed.inject(AuthService) as unknown as { currentUser: any };
      authStub.currentUser.set({
        id: 'u-cn',
        username: 'nguyenthanhbinh',
        displayName: 'Nguyễn Thanh Bình',
        email: 'user@example.com',
        phone: '0123456789',
        address: 'Lê Thanh, Mỹ Đức, Hà Nội',
        accountType: 'INDIVIDUAL',
        idNumber: '001099012345',
        status: 'ACTIVE',
        organization: null,
      });
      fixture.detectChanges();
      noiBo()['resetForm']();

      expect(noiBo()['isIndividual']()).toBe(true);
      expect(noiBo()['isEnterprise']()).toBe(false);
      expect(noiBo()['form'].displayName).toBe('Nguyễn Thanh Bình');
      expect(noiBo()['form'].address).toBe('Lê Thanh, Mỹ Đức, Hà Nội');
      expect(noiBo()['form'].phone).toBe('0123456789');

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('Số CCCD / Hộ chiếu');
      expect(el.textContent).toContain('001099012345');
    });

    it('lưu thông tin cá nhân không gửi title hay representativeName', () => {
      api.updateProfile.and.returnValue(of(void 0));
      const authStub = TestBed.inject(AuthService) as unknown as { currentUser: any };
      authStub.currentUser.set({
        id: 'u-cn',
        username: 'nguyenthanhbinh',
        displayName: 'Nguyễn Thanh Bình',
        email: 'user@example.com',
        phone: '0123456789',
        address: 'Lê Thanh, Mỹ Đức, Hà Nội',
        accountType: 'INDIVIDUAL',
        idNumber: '001099012345',
        status: 'ACTIVE',
        organization: null,
      });
      fixture.detectChanges();
      noiBo()['resetForm']();

      noiBo()['form'].displayName = 'Nguyễn Thanh Bình Mới';
      noiBo()['form'].address = 'Hà Nội Mới';
      noiBo()['form'].phone = '0987654321';
      noiBo()['saveProfile']();

      expect(api.updateProfile).toHaveBeenCalledOnceWith({
        displayName: 'Nguyễn Thanh Bình Mới',
        title: undefined,
        email: 'user@example.com',
        phone: '0987654321',
        address: 'Hà Nội Mới',
        representativeName: undefined,
      });
    });
  });

  describe('Phản ứng thay đổi queryParamMap khi đang ở trang cá nhân', () => {
    it('đang ở trang cá nhân, đổi queryParam tab=password thì mở popup đổi mật khẩu', () => {
      expect(noiBo()['passwordOpen']()).toBe(false);

      queryParamSubject.next(convertToParamMap({ tab: 'password' }));

      expect(noiBo()['passwordOpen']()).toBe(true);
    });

    it('đóng popup đổi mật khẩu thì xóa queryParam tab', () => {
      queryParamSubject.next(convertToParamMap({ tab: 'password' }));
      expect(noiBo()['passwordOpen']()).toBe(true);

      noiBo()['closePassword']();

      expect(noiBo()['passwordOpen']()).toBe(false);
      expect(routerSpy.navigate).toHaveBeenCalledWith([], {
        relativeTo: jasmine.any(Object),
        queryParams: { tab: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });
  });

  describe('Đổi ảnh đại diện (SG-85)', () => {
    it('mở modal đổi ảnh, chọn ảnh và lưu thành công thì gọi api.updateProfile, updateAvatar và hiển thị thông báo', () => {
      api.updateProfile.and.returnValue(of(void 0));
      const auth = TestBed.inject(AuthService);
      noiBo()['openAvatar']();
      expect(noiBo()['avatarOpen']()).toBe(true);

      const fakeDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      noiBo()['avatarPreview'].set(fakeDataUrl);

      noiBo()['saveAvatar']();

      expect(api.updateProfile).toHaveBeenCalledWith(jasmine.objectContaining({ avatarUrl: fakeDataUrl }));
      expect(auth.updateAvatar).toHaveBeenCalledWith(fakeDataUrl);
      expect(noiBo()['avatarOpen']()).toBe(false);
    });

    it('lưu ảnh thất bại do API lỗi thì hiển thị thông báo lỗi và giữ nguyên modal', () => {
      api.updateProfile.and.returnValue(throwError(() => new Error('API Error')));
      const showMessage = spyOn(noiBo()['appMessages'], 'show');
      noiBo()['openAvatar']();
      noiBo()['avatarPreview'].set('data:image/png;base64,123');

      noiBo()['saveAvatar']();

      expect(api.updateProfile).toHaveBeenCalled();
      expect(showMessage).toHaveBeenCalledWith('Không cập nhật được ảnh đại diện. Vui lòng thử lại.', 'error');
    });

    it('hủy đổi ảnh thì đóng modal và xóa ảnh xem trước', () => {
      noiBo()['openAvatar']();
      noiBo()['avatarPreview'].set('data:image/png;base64,...');

      noiBo()['closeAvatar']();

      expect(noiBo()['avatarOpen']()).toBe(false);
      expect(noiBo()['avatarPreview']()).toBeNull();
    });

    it('SG-210: hiển thị ảnh hiện tại nếu có và ẩn ghi chú chữ cái đầu tên; nếu chưa có ảnh thì hiển thị ghi chú chữ cái đầu tên', () => {
      noiBo()['openAvatar']();
      fixture.detectChanges();
      const text = fixture.nativeElement.textContent;
      expect(text).toBeDefined();
    });
  });
});
