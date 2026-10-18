import { PaginatedResult } from '../../../../common/http/pagination';
import { Notification } from '../../domain/notification.entity';

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

export interface NotificationSearchCriteria {
  recipientId: string;
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface NotificationRepository {
  saveMany(notifications: Notification[]): Promise<void>;
  findMany(criteria: NotificationSearchCriteria): Promise<PaginatedResult<Notification>>;
  findById(id: string): Promise<Notification | null>;
  save(notification: Notification): Promise<void>;
  countUnread(recipientId: string): Promise<number>;
  /** Đánh dấu đã đọc toàn bộ thông báo chưa đọc của một người nhận, trả về số bản ghi đã cập nhật. */
  markAllRead(recipientId: string, at: Date): Promise<number>;
}
