import { NotificationType } from '../../domain/notification-type.enum';
import { MessageKey, MessageParams } from '../../../../common/i18n/message-catalog';

export interface NotificationItemDto {
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  titleKey?: MessageKey | null;
  titleParams?: MessageParams | null;
  contentKey?: MessageKey | null;
  contentParams?: MessageParams | null;
  dossierCode: string | null;
  route: string | null;
  readAt: Date | null;
  createdAt: Date;
}

/** Danh sách thông báo dùng chung quy ước phân trang, bổ sung `unreadCount` cho badge trên chuông. */
export interface NotificationListDto {
  items: NotificationItemDto[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount: number;
}
