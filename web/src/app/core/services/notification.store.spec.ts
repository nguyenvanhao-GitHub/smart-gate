import { discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiService, NotificationItem, NotificationPage } from './api.service';
import { NotificationStore } from './notification.store';

/**
 * Kho thông báo dùng chung (chuông topbar + trang /notifications).
 * Polling 60s được kiểm bằng `fakeAsync` + `tick`, không chờ thời gian thật.
 */

const CHU_KY_MS = 60_000;

function thongBao(id: string, daDoc = false): NotificationItem {
  return {
    id,
    type: 'DOSSIER',
    title: `Thông báo ${id}`,
    content: 'Nội dung thử nghiệm',
    dossierCode: 'HS-001',
    route: '/declarations/1',
    readAt: daDoc ? '2026-07-01T00:00:00.000Z' : null,
    createdAt: '2026-07-01T00:00:00.000Z',
  };
}

function trang(items: NotificationItem[], unreadCount: number): NotificationPage {
  return { items, total: items.length, page: 1, pageSize: 8, unreadCount };
}

describe('NotificationStore — đếm chưa đọc và polling', () => {
  let api: jasmine.SpyObj<ApiService>;
  let store: NotificationStore;

  beforeEach(() => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getUnreadNotificationCount',
      'getNotifications',
      'markNotificationRead',
      'markAllNotificationsRead',
    ]);
    api.getUnreadNotificationCount.and.returnValue(of({ count: 3 }));
    api.getNotifications.and.returnValue(of(trang([thongBao('n1'), thongBao('n2'), thongBao('n3', true)], 2)));
    api.markNotificationRead.and.returnValue(of(void 0));
    api.markAllNotificationsRead.and.returnValue(of(void 0));

    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    store = TestBed.inject(NotificationStore);
  });

  // ---------------------------------------------------------------------------
  describe('Polling 60 giây', () => {
    it('gọi ngay lần đầu rồi lặp lại mỗi 60 giây', fakeAsync(() => {
      store.startPolling();
      expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(1);
      expect(store.unreadCount()).toBe(3);

      tick(CHU_KY_MS);
      expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(2);

      tick(CHU_KY_MS);
      expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(3);

      store.stopPolling();
      discardPeriodicTasks();
    }));

    it('chưa tới 60 giây thì chưa gọi lại', fakeAsync(() => {
      store.startPolling();
      tick(CHU_KY_MS - 1);
      expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(1);

      store.stopPolling();
      discardPeriodicTasks();
    }));

    it('gọi startPolling nhiều lần không tạo thêm bộ đếm giờ', fakeAsync(() => {
      store.startPolling();
      store.startPolling();
      store.startPolling();
      // 3 lần gọi ngay lập tức, nhưng chỉ MỘT bộ đếm giờ.
      expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(3);

      tick(CHU_KY_MS);
      expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(4);

      store.stopPolling();
      discardPeriodicTasks();
    }));

    it('stopPolling dừng hẳn việc hỏi lại', fakeAsync(() => {
      store.startPolling();
      store.stopPolling();

      tick(CHU_KY_MS * 3);
      expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(1);
    }));

    it('lỗi API khi polling không làm vỡ store — giữ nguyên số liệu cũ', fakeAsync(() => {
      store.startPolling();
      expect(store.unreadCount()).toBe(3);

      api.getUnreadNotificationCount.and.returnValue(throwError(() => new Error('mat ket noi')));
      expect(() => tick(CHU_KY_MS)).not.toThrow();
      expect(store.unreadCount()).toBe(3);

      // Kết nối trở lại thì số liệu cập nhật tiếp, bộ đếm giờ vẫn sống.
      api.getUnreadNotificationCount.and.returnValue(of({ count: 7 }));
      tick(CHU_KY_MS);
      expect(store.unreadCount()).toBe(7);

      store.stopPolling();
      discardPeriodicTasks();
    }));

    it('phản hồi thiếu trường count được coi là 0', fakeAsync(() => {
      api.getUnreadNotificationCount.and.returnValue(of({} as { count: number }));
      store.refreshUnreadCount();
      expect(store.unreadCount()).toBe(0);
    }));
  });

  // ---------------------------------------------------------------------------
  describe('Badge hiển thị', () => {
    it('hiển thị đúng số khi nhỏ hơn 100', () => {
      api.getUnreadNotificationCount.and.returnValue(of({ count: 99 }));
      store.refreshUnreadCount();
      expect(store.badge()).toBe('99');
    });

    it('vượt 99 thì hiển thị 99+', () => {
      api.getUnreadNotificationCount.and.returnValue(of({ count: 128 }));
      store.refreshUnreadCount();
      expect(store.badge()).toBe('99+');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Nạp danh sách gần đây', () => {
    it('nạp 8 thông báo mới nhất và đồng bộ số chưa đọc', () => {
      store.loadRecent();

      expect(api.getNotifications).toHaveBeenCalledOnceWith({ page: 1, pageSize: 8 });
      expect(store.recent().length).toBe(3);
      expect(store.unreadCount()).toBe(2);
      expect(store.loading()).toBe(false);
      expect(store.error()).toBe('');
    });

    it('lỗi API thì báo lỗi và tắt trạng thái đang tải', () => {
      api.getNotifications.and.returnValue(throwError(() => new Error('loi')));
      store.loadRecent();

      expect(store.recent()).toEqual([]);
      expect(store.loading()).toBe(false);
      expect(store.error()).toBe('Không tải được thông báo. Vui lòng thử lại.');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Đánh dấu đã đọc', () => {
    beforeEach(() => store.loadRecent());

    it('markRead giảm số chưa đọc và gắn thời điểm đọc', () => {
      store.markRead('n1');

      expect(api.markNotificationRead).toHaveBeenCalledOnceWith('n1');
      expect(store.unreadCount()).toBe(1);
      expect(store.recent().find((item) => item.id === 'n1')?.readAt).toBeTruthy();
      expect(store.recent().find((item) => item.id === 'n2')?.readAt).toBeNull();
    });

    it('markRead thông báo đã đọc sẵn giữ nguyên readAt và KHÔNG trừ số chưa đọc', () => {
      const truoc = store.recent().find((item) => item.id === 'n3')?.readAt;
      store.markRead('n3');

      expect(store.recent().find((item) => item.id === 'n3')?.readAt).toBe(truoc);
      expect(store.unreadCount()).toBe(2);
    });

    it('bấm lại nhiều lần cùng một thông báo chỉ trừ đúng một lần', () => {
      store.markRead('n1');
      store.markRead('n1');
      store.markRead('n1');

      expect(store.unreadCount()).toBe(1);
    });

    it('số chưa đọc không bao giờ âm', () => {
      store.markRead('n1');
      store.markRead('n2');
      store.markRead('n3');
      expect(store.unreadCount()).toBe(0);
    });

    it('markAllRead đưa số chưa đọc về 0 và đánh dấu mọi thông báo', () => {
      store.markAllRead();

      expect(api.markAllNotificationsRead).toHaveBeenCalledTimes(1);
      expect(store.unreadCount()).toBe(0);
      expect(store.recent().every((item) => !!item.readAt)).toBe(true);
    });

    it('markRead lỗi thì báo lỗi và giữ nguyên số chưa đọc', () => {
      api.markNotificationRead.and.returnValue(throwError(() => new Error('loi')));
      store.markRead('n1');

      expect(store.unreadCount()).toBe(2);
      expect(store.error()).toBe('Không đánh dấu được thông báo đã đọc.');
    });

    it('markAllRead lỗi thì báo lỗi và giữ nguyên số chưa đọc', () => {
      api.markAllNotificationsRead.and.returnValue(throwError(() => new Error('loi')));
      store.markAllRead();

      expect(store.unreadCount()).toBe(2);
      expect(store.error()).toBe('Không đánh dấu được tất cả thông báo.');
    });
  });

  // ---------------------------------------------------------------------------
  it('reset dừng polling và xóa sạch dữ liệu (dùng khi đăng xuất)', fakeAsync(() => {
    store.loadRecent();
    store.startPolling();

    store.reset();
    expect(store.unreadCount()).toBe(0);
    expect(store.recent()).toEqual([]);
    expect(store.error()).toBe('');

    const soLanDaGoi = api.getUnreadNotificationCount.calls.count();
    tick(CHU_KY_MS * 2);
    expect(api.getUnreadNotificationCount).toHaveBeenCalledTimes(soLanDaGoi);
  }));
});
