import { Inject, Injectable, Logger } from '@nestjs/common';
import { translate } from '../../../../common/i18n/translate';
import {
  NotificationPublisher,
  PublishNotificationInput,
} from '../../../../common/notifications/notification-publisher.port';
import { USER_DIRECTORY, UserDirectory } from '../../../access-control/application/ports/user-directory.repository';
import { Notification } from '../../domain/notification.entity';
import { NotificationType } from '../../domain/notification-type.enum';
import { NOTIFICATION_REPOSITORY, NotificationRepository } from '../ports/notification.repository';

/**
 * Hiện thực `NOTIFICATION_PUBLISHER`.
 *
 * Người nhận được suy ra theo thứ tự: danh sách chỉ định → tài khoản tạo hồ sơ → các tài khoản
 * được phân công mã số thuế của doanh nghiệp trên hồ sơ (`user_assignments.type = TAX_CODE`).
 * Ở P1 hồ sơ chưa có bảng `Enterprise` riêng nên đây là cách xác định chủ sở hữu duy nhất có sẵn.
 */
@Injectable()
export class NotificationPublisherService implements NotificationPublisher {
  private readonly logger = new Logger(NotificationPublisherService.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepository,
    @Inject(USER_DIRECTORY)
    private readonly users: UserDirectory,
  ) {}

  async publish(input: PublishNotificationInput): Promise<void> {
    try {
      const recipients = await this.resolveRecipients(input);
      if (recipients.length === 0) {
        this.logger.debug(`Không tìm được người nhận cho thông báo ${input.type} của hồ sơ ${input.dossierCode ?? '-'}.`);
        return;
      }

      const title = input.titleKey
        ? translate(input.titleKey, input.titleParams, 'vi')
        : input.title ?? '';
      const content = input.contentKey
        ? translate(input.contentKey, input.contentParams, 'vi')
        : input.content ?? '';

      await this.notifications.saveMany(
        recipients.map((recipientId) =>
          Notification.create({
            recipientId,
            type: input.type,
            title,
            content,
            titleKey: input.titleKey ?? null,
            titleParams: input.titleParams ?? null,
            contentKey: input.contentKey ?? null,
            contentParams: input.contentParams ?? null,
            dossierId: input.dossierId ?? null,
            dossierCode: input.dossierCode ?? null,
            route: input.route !== undefined ? input.route : (input.dossierId ? `/declarations/${input.dossierId}` : null),
          }),
        ),
      );
    } catch (error) {
      // Thông báo là chức năng phụ trợ: không được làm hỏng hành động nghiệp vụ đã thực hiện xong.
      this.logger.warn(`Không gửi được thông báo ${input.type}: ${(error as Error).message}`);
    }
  }

  private async resolveRecipients(input: PublishNotificationInput): Promise<string[]> {
    const recipients = new Set<string>(input.recipientIds || []);
    if (input.ownerUserId) recipients.add(input.ownerUserId);
    if (input.enterpriseTaxCode) {
      for (const userId of await this.users.findIdsByTaxCode(input.enterpriseTaxCode)) recipients.add(userId);
    }
    if (input.targetRoleCodes && input.targetRoleCodes.length > 0) {
      for (const userId of await this.users.findIdsByRoleCodes(input.targetRoleCodes)) recipients.add(userId);
    }
    if (input.recipientRoleCodes && input.recipientRoleCodes.length > 0) {
      for (const roleCode of input.recipientRoleCodes) {
        for (const userId of await this.users.findIdsByRoleCode(roleCode)) {
          recipients.add(userId);
        }
      }
    }
    if (input.stepCodes && input.stepCodes.length > 0) {
      for (const stepCode of input.stepCodes) {
        for (const userId of await this.users.findIdsByStepCode(stepCode)) recipients.add(userId);
      }
    }
    if (input.type === NotificationType.USER_REGISTERED) {
      for (const adminId of await this.users.findIdsByRoleCode('SYS_ADMIN')) recipients.add(adminId);
      for (const adminId of await this.users.findIdsByRoleCode('ADMIN')) recipients.add(adminId);
    }
    if (input.excludeActorId) {
      recipients.delete(input.excludeActorId);
    }
    return [...recipients];
  }
}

