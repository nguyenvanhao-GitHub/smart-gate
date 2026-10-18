import { Inject, Injectable } from '@nestjs/common';
import { NOTIFICATION_REPOSITORY, NotificationRepository } from '../ports/notification.repository';
import { appNotFound, appForbidden } from '../../../../common/i18n';

@Injectable()
export class MarkNotificationReadUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepository,
  ) {}

  async execute(notificationId: string, recipientId: string): Promise<{ id: string; readAt: Date | null }> {
    const notification = await this.notifications.findById(notificationId);
    if (!notification) throw appNotFound('notification.notFound');
    if (notification.recipientId !== recipientId) {
      throw appForbidden('notification.forbidden');
    }

    notification.markRead();
    await this.notifications.save(notification);
    return { id: notification.id, readAt: notification.readAt };
  }
}
