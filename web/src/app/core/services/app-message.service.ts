import { Injectable, inject, signal } from '@angular/core';
import { I18nService } from '../i18n/i18n.service';
import { MessageKey, MessageParams } from '../i18n/message-catalog';

export type AppMessageTone = 'success' | 'warning' | 'error' | 'info';

export interface AppMessage {
  id: number;
  tone: AppMessageTone;
  text: string;
}

const DEFAULT_TIMEOUT_MS = 6000;

/**
 * Hàng đợi thông báo nổi dùng chung cho toàn ứng dụng.
 *
 * Dành cho những thông báo phát sinh ngoài phạm vi một trang cụ thể — ví dụ
 * `auth-token.interceptor` bắt được 401/403 và phải báo cho người dùng dù họ
 * đang ở bất kỳ màn hình nào. Thông báo trong phạm vi một trang vẫn dùng
 * `<sg-alert>` đặt ngay trên trang đó.
 *
 * Trùng nội dung thì bỏ qua: nhiều request song song cùng lỗi chỉ hiện MỘT thông báo.
 */
@Injectable({ providedIn: 'root' })
export class AppMessageService {
  private readonly i18n = inject(I18nService);
  private readonly items = signal<AppMessage[]>([]);
  private nextId = 1;

  readonly messages = this.items.asReadonly();

  /** Hiện thông báo theo **khóa** — lời văn lấy theo ngôn ngữ đang chọn tại thời điểm hiện. */
  showKey(key: MessageKey, tone: AppMessageTone = 'info', params?: MessageParams, timeoutMs = DEFAULT_TIMEOUT_MS): void {
    this.show(this.i18n.t(key, params), tone, timeoutMs);
  }

  /**
   * Hiện thông báo lỗi từ API: ưu tiên bản dịch theo `messageKey`, không có thì dùng `message` API
   * gửi kèm, không có cả hai thì chuỗi mặc định — không bao giờ hiện khóa trần.
   */
  showApiError(error: unknown, fallback?: MessageKey): void {
    this.show(this.i18n.apiError(error, fallback ?? 'ui.common.unknownError'), 'error');
  }

  show(text: string, tone: AppMessageTone = 'info', timeoutMs = DEFAULT_TIMEOUT_MS): void {
    if (!text || this.items().some((item) => item.text === text)) return;
    const id = this.nextId++;
    this.items.update((list) => [...list, { id, tone, text }]);
    if (timeoutMs > 0) setTimeout(() => this.dismiss(id), timeoutMs);
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((item) => item.id !== id));
  }

  clear(): void {
    this.items.set([]);
  }
}
