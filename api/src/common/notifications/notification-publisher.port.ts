import { NotificationType } from '../../modules/notifications/domain/notification-type.enum';
import { MessageKey, MessageParams } from '../i18n/message-catalog';

/**
 * Cổng phát thông báo (F06). Đặt ở common để module nghiệp vụ (hồ sơ, phí…) sinh thông báo
 * mà không phụ thuộc vào hiện thực của module `notifications`.
 */
export const NOTIFICATION_PUBLISHER = Symbol('NOTIFICATION_PUBLISHER');

export interface PublishNotificationInput {
  type: NotificationType;
  titleKey?: MessageKey;
  titleParams?: MessageParams;
  title?: string;
  contentKey?: MessageKey;
  contentParams?: MessageParams;
  content?: string;
  /** Hồ sơ liên quan — dùng để điều hướng từ thông báo sang màn chi tiết. */
  dossierId?: string;
  dossierCode?: string;
  route?: string | null;
  /** Người nhận tường minh. Bỏ trống thì hệ thống tự suy ra từ `ownerUserId` + `enterpriseTaxCode` + `stepCodes` + `targetRoleCodes`. */
  recipientIds?: string[];
  /** Tài khoản đã tạo hồ sơ (doanh nghiệp hoặc cá nhân). */
  ownerUserId?: string;
  /** Mã số thuế doanh nghiệp trên hồ sơ — người dùng được phân công TAX_CODE tương ứng sẽ nhận. */
  enterpriseTaxCode?: string;
  /** Mã các bước quy trình đang mở/đến lượt — người dùng có vai trò phụ trách các bước này sẽ nhận thông báo. */
  stepCodes?: string[];
  /** Danh sách mã vai trò mục tiêu sẽ nhận thông báo. */
  targetRoleCodes?: string[];
  /** Danh sách mã vai trò (RBAC) sẽ nhận thông báo này (ví dụ: SYS_ADMIN, BORDER_GUARD, CUSTOMS, QUARANTINE...). */
  recipientRoleCodes?: string[];
  /** ID tài khoản thực hiện thao tác (nếu có) — loại trừ không nhận thông báo do chính mình kích hoạt. */
  excludeActorId?: string;
}

export interface NotificationPublisher {
  publish(input: PublishNotificationInput): Promise<void>;
}
