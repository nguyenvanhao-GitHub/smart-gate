import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { ApiService } from '../services/api.service';
import { ShellComponent } from './shell.component';

/**
 * Khung ứng dụng (topbar + sidebar). Kiểm hành vi hộp xổ trên topbar:
 *   - BUG-053/BUG-056: hộp xổ tài khoản và panel chuông đóng khi bấm ra ngoài,
 *     nhưng bấm bên trong `.dropdown` thì không đóng.
 *   - BUG-053: mũi tên nút tài khoản xoay khi hộp xổ đang mở.
 */
describe('ShellComponent — hộp xổ topbar', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<ShellComponent>;
  let component: ShellComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function taoShell(): void {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });

    fixture = TestBed.createComponent(ShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getUnreadNotificationCount',
      'getNotifications',
      'markNotificationRead',
      'markAllNotificationsRead',
    ]);
    api.getUnreadNotificationCount.and.returnValue(of({ count: 0 }));
    api.getNotifications.and.returnValue(of({ items: [], total: 0, page: 1, pageSize: 8, unreadCount: 0 }));
    api.markNotificationRead.and.returnValue(of(void 0));
    api.markAllNotificationsRead.and.returnValue(of(void 0));

    taoShell();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
    localStorage.clear();
    sessionStorage.clear();
  });

  // --- Đóng khi bấm ra ngoài (BUG-053/BUG-056) -------------------------------
  it('bấm ra ngoài thì đóng hộp xổ tài khoản đang mở', () => {
    noiBo()['toggleAccount']();
    expect(noiBo()['accountOpen']()).toBe(true);

    noiBo()['onDocumentClick']({ target: document.body } as unknown as MouseEvent);

    expect(noiBo()['accountOpen']()).toBe(false);
  });

  it('bấm ra ngoài thì đóng panel chuông đang mở', () => {
    noiBo()['toggleBell']();
    expect(noiBo()['bellOpen']()).toBe(true);

    noiBo()['onDocumentClick']({ target: document.body } as unknown as MouseEvent);

    expect(noiBo()['bellOpen']()).toBe(false);
  });

  it('bấm bên trong .dropdown thì KHÔNG đóng hộp xổ (đổi tab, thao tác trong panel)', () => {
    noiBo()['toggleBell']();
    fixture.detectChanges();
    const trongDropdown = fixture.nativeElement.querySelector('.panel--notifications') as HTMLElement;
    expect(trongDropdown).toBeTruthy();

    noiBo()['onDocumentClick']({ target: trongDropdown } as unknown as MouseEvent);

    expect(noiBo()['bellOpen']()).toBe(true);
  });

  it('không có hộp xổ nào mở thì bấm ngoài không gây lỗi', () => {
    expect(() => noiBo()['onDocumentClick']({ target: document.body } as unknown as MouseEvent)).not.toThrow();
    expect(noiBo()['accountOpen']()).toBe(false);
    expect(noiBo()['bellOpen']()).toBe(false);
  });

  // --- Đầu hộp xổ tài khoản hiện tên + email (BUG-091) -----------------------
  it('hộp xổ tài khoản có phần đầu hiện tên và email người đăng nhập', () => {
    noiBo()['toggleAccount']();
    fixture.detectChanges();

    const head = fixture.nativeElement.querySelector('.panel__account-head') as HTMLElement;
    expect(head).toBeTruthy();
    // Chưa có hồ sơ trong test → rơi về nhãn dự phòng, nhưng cấu trúc tên + email đều có mặt.
    expect(head.querySelector('.panel__account-info strong')).toBeTruthy();
    expect(head.querySelector('.panel__account-info em')?.textContent).toContain('Chưa có thư điện tử');
  });

  // --- Thời gian tương đối của thông báo (BUG-087) ---------------------------
  describe('relativeTime — thời gian tương đối', () => {
    it('mốc vài phút trước cho chuỗi "x phút trước"', () => {
      const fewMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
      expect(noiBo()['relativeTime'](fewMinutesAgo)).toContain('phút trước');
    });

    it('mốc quá 7 ngày trả rỗng để template rơi về ngày giờ tuyệt đối', () => {
      const longAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
      expect(noiBo()['relativeTime'](longAgo)).toBe('');
    });
  });

  // --- Mũi tên nút tài khoản xoay khi mở (BUG-053) ---------------------------
  it('mũi tên tài khoản gắn class --open khi hộp xổ mở, gỡ khi đóng', () => {
    let caret = fixture.nativeElement.querySelector('.account__caret') as HTMLElement;
    expect(caret.classList.contains('account__caret--open')).toBe(false);

    noiBo()['toggleAccount']();
    fixture.detectChanges();
    caret = fixture.nativeElement.querySelector('.account__caret') as HTMLElement;
    expect(caret.classList.contains('account__caret--open')).toBe(true);

    noiBo()['closeMenus']();
    fixture.detectChanges();
    caret = fixture.nativeElement.querySelector('.account__caret') as HTMLElement;
    expect(caret.classList.contains('account__caret--open')).toBe(false);
  });

  it('click thông báo chờ thu phí mở đúng màn thu phí của hồ sơ', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigateByUrl').and.resolveTo(true);

    noiBo()['openNotification']({ id: 'notif-fee-1', route: '/declarations/dossier-1/fees' });

    expect(api.markNotificationRead).toHaveBeenCalledWith('notif-fee-1');
    expect(navigateSpy).toHaveBeenCalledOnceWith('/declarations/dossier-1/fees');
  });
});
