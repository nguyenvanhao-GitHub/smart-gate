import { computed, Injectable, inject, signal } from '@angular/core';
import { I18nService } from '../i18n/i18n.service';
import { ApiService, NotificationItem } from './api.service';

/** Chu kỳ hỏi lại số thông báo chưa đọc (F06 — in-app + polling, xem kế hoạch C6). */
const POLL_INTERVAL_MS = 60_000;
const RECENT_SIZE = 8;

/**
 * Trạng thái thông báo dùng chung giữa chuông trên topbar và trang `/notifications`.
 * Mọi lệnh HTTP vẫn đi qua `ApiService`.
 */
@Injectable({ providedIn: 'root' })
export class NotificationStore {
  private readonly unread = signal(0);
  private readonly recentItems = signal<NotificationItem[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal('');
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly t = inject(I18nService).t;

  readonly unreadCount = this.unread.asReadonly();
  readonly recent = this.recentItems.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly badge = computed(() => (this.unread() > 99 ? '99+' : String(this.unread())));

  constructor(private readonly api: ApiService) {}

  startPolling(): void {
    this.refreshUnreadCount();
    if (this.timer) return;
    this.timer = setInterval(() => this.refreshUnreadCount(), POLL_INTERVAL_MS);
  }

  stopPolling(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  refreshUnreadCount(): void {
    this.api.getUnreadNotificationCount().subscribe({
      next: (result) => this.unread.set(result?.count ?? 0),
      error: () => undefined,
    });
  }

  loadRecent(): void {
    this.loadingSignal.set(true);
    this.errorSignal.set('');
    this.api.getNotifications({ page: 1, pageSize: RECENT_SIZE }).subscribe({
      next: (page) => {
        this.recentItems.set(page?.items ?? []);
        this.unread.set(page?.unreadCount ?? 0);
        this.loadingSignal.set(false);
      },
      error: () => {
        this.recentItems.set([]);
        this.errorSignal.set(this.t('ui.shell.notificationsLoadFailed'));
        this.loadingSignal.set(false);
      },
    });
  }

  markRead(id: string): void {
    this.api.markNotificationRead(id).subscribe({
      next: () => {
        // Chỉ trừ bộ đếm khi thông báo đang thực sự CHƯA đọc — bấm lại một thông báo
        // đã đọc không được làm badge chuông giảm sai.
        const dangChuaDoc = this.recentItems().some((item) => item.id === id && !item.readAt);
        this.recentItems.update((items) =>
          items.map((item) => (item.id === id && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item)),
        );
        if (dangChuaDoc) this.unread.update((count) => Math.max(0, count - 1));
      },
      error: () => this.errorSignal.set(this.t('ui.shell.markReadFailed')),
    });
  }

  markAllRead(): void {
    this.api.markAllNotificationsRead().subscribe({
      next: () => {
        const now = new Date().toISOString();
        this.recentItems.update((items) => items.map((item) => (item.readAt ? item : { ...item, readAt: now })));
        this.unread.set(0);
      },
      error: () => this.errorSignal.set(this.t('ui.shell.markAllReadFailed')),
    });
  }

  reset(): void {
    this.stopPolling();
    this.unread.set(0);
    this.recentItems.set([]);
    this.errorSignal.set('');
  }
}
