import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApiService } from '../services/api.service';
import { AccessProfile, MenuItem, PermissionRequirement } from './access-control.model';
import { AuthService } from './auth.service';
import { HasPermissionDirective } from './has-permission.directive';
import { SESSION_STORAGE_KEY } from './session.storage';

/**
 * `*hasPermission` là lớp che giao diện theo quyền động lấy từ API.
 * Ẩn/hiện sai ở đây làm lộ nút thao tác của lực lượng khác (dù API vẫn chặn).
 */

const MENU_MAU: MenuItem[] = [{ key: 'dossier', label: 'Hồ sơ', icon: 'description', route: '/declarations' }];

function hoSoTruyCap(permissions: string[]): AccessProfile {
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
    permissions,
    assignments: [],
    menu: MENU_MAU,
  };
}

@Component({
  standalone: true,
  imports: [HasPermissionDirective],
  template: `<button type="button" *hasPermission="quyen">Duyệt hồ sơ</button>`,
})
class TrangThuComponent {
  quyen: PermissionRequirement = 'dossier.approve';
}

describe('HasPermissionDirective — ẩn/hiện theo quyền động', () => {
  let fixture: ComponentFixture<TrangThuComponent>;
  /** Hồ sơ mà `ApiService` giả lập sẽ trả về ở lần `refreshProfile()` kế tiếp. */
  let hoSoHienTai: AccessProfile;

  function dungMoiTruong(permissions: string[] | null): void {
    localStorage.clear();
    sessionStorage.clear();
    hoSoHienTai = hoSoTruyCap(permissions ?? []);
    if (permissions) {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ accessToken: 'token-gia-lap', profile: hoSoTruyCap(permissions) }),
      );
    }
    TestBed.configureTestingModule({
      imports: [TrangThuComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: { getAccessProfile: () => of(hoSoHienTai) } }],
    });
    fixture = TestBed.createComponent(TrangThuComponent);
  }

  /** Đổi quyền của người dùng đang đăng nhập (như khi quản trị vừa sửa phân quyền). */
  function capNhatQuyen(permissions: string[]): void {
    hoSoHienTai = hoSoTruyCap(permissions);
    TestBed.inject(AuthService).refreshProfile().subscribe();
    fixture.detectChanges();
  }

  function hienThi(): boolean {
    return !!fixture.nativeElement.querySelector('button');
  }

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('có quyền thì hiện phần tử', () => {
    dungMoiTruong(['dossier.approve']);
    fixture.detectChanges();
    expect(hienThi()).toBe(true);
  });

  it('không có quyền thì ẩn phần tử', () => {
    dungMoiTruong(['dossier.view']);
    fixture.detectChanges();
    expect(hienThi()).toBe(false);
  });

  it('người dùng không có quyền nào thì ẩn', () => {
    dungMoiTruong([]);
    fixture.detectChanges();
    expect(hienThi()).toBe(false);
  });

  it('chưa đăng nhập thì ẩn', () => {
    dungMoiTruong(null);
    fixture.detectChanges();
    expect(hienThi()).toBe(false);
  });

  it('dạng mảng — hiện khi có BẤT KỲ quyền nào trong danh sách', () => {
    dungMoiTruong(['fee.approve']);
    fixture.componentInstance.quyen = ['fee.view', 'fee.approve'];
    fixture.detectChanges();
    expect(hienThi()).toBe(true);
  });

  it('dạng mảng — ẩn khi không có quyền nào trong danh sách', () => {
    dungMoiTruong(['dossier.view']);
    fixture.componentInstance.quyen = ['fee.view', 'fee.approve'];
    fixture.detectChanges();
    expect(hienThi()).toBe(false);
  });

  it('mã quyền rỗng (chuỗi rỗng) thì ẩn', () => {
    dungMoiTruong(['dossier.approve']);
    fixture.componentInstance.quyen = '';
    fixture.detectChanges();
    expect(hienThi()).toBe(false);
  });

  it('yêu cầu quyền rỗng ([] hoặc null) thì ẨN — fail-closed', () => {
    // `*hasPermission` nghĩa là "có BẤT KỲ quyền nào trong danh sách"; danh sách rỗng thì
    // không quyền nào thỏa mãn. Nhờ vậy `computed()` trả [] lúc dữ liệu chưa nạp xong
    // sẽ không làm lộ nút thao tác.
    dungMoiTruong(['dossier.approve']);
    fixture.componentInstance.quyen = [];
    fixture.detectChanges();
    expect(hienThi()).toBe(false);

    fixture.componentInstance.quyen = null;
    fixture.detectChanges();
    expect(hienThi()).toBe(false);

    fixture.componentInstance.quyen = undefined;
    fixture.detectChanges();
    expect(hienThi()).toBe(false);
  });

  it('thu hồi quyền sau khi render thì phần tử bị ẩn ngay', () => {
    dungMoiTruong(['dossier.approve']);
    fixture.detectChanges();
    expect(hienThi()).toBe(true);

    capNhatQuyen(['dossier.view']);
    expect(hienThi()).toBe(false);
  });

  it('cấp thêm quyền sau khi render thì phần tử hiện ra', () => {
    dungMoiTruong(['dossier.view']);
    fixture.detectChanges();
    expect(hienThi()).toBe(false);

    capNhatQuyen(['dossier.view', 'dossier.approve']);
    expect(hienThi()).toBe(true);
  });

  it('đổi yêu cầu quyền trên input thì view cập nhật theo', () => {
    dungMoiTruong(['fee.view']);
    fixture.detectChanges();
    expect(hienThi()).toBe(false);

    fixture.componentInstance.quyen = 'fee.view';
    fixture.detectChanges();
    expect(hienThi()).toBe(true);
  });
});
