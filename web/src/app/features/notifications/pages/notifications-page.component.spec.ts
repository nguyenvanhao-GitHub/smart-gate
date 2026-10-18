import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiService, NotificationItem, NotificationPage } from '../../../core/services/api.service';
import { AppMessageService } from '../../../core/services/app-message.service';
import { NotificationsPageComponent } from './notifications-page.component';

/**
 * F06 — Trang danh sách thông báo.
 *
 * Khóa các sửa lỗi của LÔ 1:
 *  - BUG #3: khi lọc từ khóa tại chỗ thì **ẩn** `sg-pager` (pager server hết ý nghĩa) và `summary`
 *    đếm theo số dòng client.
 *  - BUG #4: ô biểu tượng lấy sắc thái theo **mã loại** thật, không suy từ nhãn.
 *  - Gom nhóm theo mốc thời gian hiển thị đúng các nhãn nhóm.
 */

function thongBao(overrides: Partial<NotificationItem> = {}): NotificationItem {
  const now = new Date();
  return {
    id: overrides.id ?? 'n1',
    type: overrides.type ?? 'DOSSIER_STATUS_CHANGED',
    title: overrides.title ?? 'Tiêu đề',
    content: overrides.content ?? 'Nội dung',
    dossierCode: overrides.dossierCode ?? 'HS-001',
    route: overrides.route ?? null,
    readAt: overrides.readAt ?? null,
    createdAt: overrides.createdAt ?? now.toISOString(),
  };
}

function trang(items: NotificationItem[], total = items.length): NotificationPage {
  return { items, total, page: 1, pageSize: 20, unreadCount: items.filter((item) => !item.readAt).length };
}

describe('NotificationsPageComponent — danh sách thông báo (F06)', () => {
  let api: jasmine.SpyObj<ApiService>;
  let fixture: ComponentFixture<NotificationsPageComponent>;
  let component: NotificationsPageComponent;

  function noiBo(): Record<string, any> {
    return component as unknown as Record<string, any>;
  }

  function taoTrang(): void {
    TestBed.configureTestingModule({
      imports: [NotificationsPageComponent],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    fixture = TestBed.createComponent(NotificationsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getNotifications',
      'getUnreadNotificationCount',
      'markNotificationRead',
      'markAllNotificationsRead',
    ]);
    api.getUnreadNotificationCount.and.returnValue(of({ count: 0 }));
    api.getNotifications.and.returnValue(
      of(
        trang([
          thongBao({ id: 'a', type: 'DOSSIER_SUPPLEMENT_REQUESTED', title: 'Cần bổ sung hồ sơ', dossierCode: 'HS-A' }),
          thongBao({ id: 'b', type: 'DOSSIER_REJECTED', title: 'Hồ sơ bị từ chối', dossierCode: 'HS-B' }),
          thongBao({ id: 'c', type: 'DOSSIER_STEP_CONFIRMED', title: 'Đã xác nhận bước', dossierCode: 'HS-C' }),
        ]),
      ),
    );
    api.markNotificationRead.and.returnValue(of(void 0));
    api.markAllNotificationsRead.and.returnValue(of(void 0));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('nạp danh sách khi khởi tạo và hiển thị đủ dòng', () => {
    taoTrang();
    expect(api.getNotifications).toHaveBeenCalled();
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.row');
    expect(rows.length).toBe(3);
  });

  it('BUG #4 — ô biểu tượng lấy sắc thái theo mã loại thật', () => {
    taoTrang();
    const tones = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.row__ico'),
    ).map((el) => el.getAttribute('data-tone'));
    // DOSSIER_SUPPLEMENT_REQUESTED→warn, DOSSIER_REJECTED→danger, DOSSIER_STEP_CONFIRMED→success.
    expect(tones).toContain('warn');
    expect(tones).toContain('danger');
    expect(tones).toContain('success');
  });

  describe('BUG #3 — lọc từ khóa tại chỗ', () => {
    it('chưa lọc thì hiện sg-pager và không ở chế độ lọc client', () => {
      taoTrang();
      expect(noiBo()['isClientFiltered']()).toBeFalse();
      expect(fixture.nativeElement.querySelector('sg-pager')).not.toBeNull();
    });

    it('có từ khóa thì ẩn sg-pager, summary đếm theo số dòng client', () => {
      taoTrang();
      noiBo()['keyword'] = 'từ chối';
      noiBo()['applyFilters']();
      fixture.detectChanges();

      expect(noiBo()['isClientFiltered']()).toBeTrue();
      // Chỉ 1 dòng khớp "từ chối" (HS-B) → pager ẩn, summary đếm client.
      expect(noiBo()['visibleItems']().length).toBe(1);
      expect(fixture.nativeElement.querySelector('sg-pager')).toBeNull();
      expect(noiBo()['summary']()).toContain('1');
    });

    it('reset xóa từ khóa và trở lại hiển thị pager', () => {
      taoTrang();
      noiBo()['keyword'] = 'từ chối';
      noiBo()['applyFilters']();
      fixture.detectChanges();

      noiBo()['resetFilters']();
      fixture.detectChanges();
      expect(noiBo()['isClientFiltered']()).toBeFalse();
      expect(fixture.nativeElement.querySelector('sg-pager')).not.toBeNull();
    });
  });

  it('gom nhóm theo mốc thời gian: dữ liệu hôm nay hiện nhãn "Hôm nay"', () => {
    taoTrang();
    const groups = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.group')).map(
      (el) => (el.textContent ?? '').trim(),
    );
    expect(groups).toContain('Hôm nay');
  });

  it('lỗi tải danh sách thì báo lỗi và không có dòng nào', () => {
    api.getNotifications.and.returnValue(throwError(() => new Error('loi')));
    taoTrang();
    expect(TestBed.inject(AppMessageService).messages().some((m) => m.tone === 'error')).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.row').length).toBe(0);
  });

  it('đánh dấu đã đọc một thông báo gọi API và gắn readAt', () => {
    taoTrang();
    noiBo()['markRead'](thongBao({ id: 'a' }));
    expect(api.markNotificationRead).toHaveBeenCalledWith('a');
    expect(noiBo()['items']().find((row: NotificationItem) => row.id === 'a')?.readAt).toBeTruthy();
  });

  it('đổi tab sang Chưa đọc tải lại với unreadOnly=true', () => {
    taoTrang();
    noiBo()['setTab']('unread');
    const args = api.getNotifications.calls.mostRecent().args[0] ?? {};
    expect(args.unreadOnly).toBeTrue();
  });

  it('click thông báo chờ thu phí mở đúng màn thu phí của hồ sơ', () => {
    taoTrang();
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    const item = thongBao({ id: 'fee-1', route: '/declarations/dossier-1/fees' });

    noiBo()['open'](item);

    expect(api.markNotificationRead).toHaveBeenCalledWith('fee-1');
    expect(navigateSpy).toHaveBeenCalledOnceWith('/declarations/dossier-1/fees');
  });
});
