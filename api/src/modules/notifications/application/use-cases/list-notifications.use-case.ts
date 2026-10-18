import { Inject, Injectable } from '@nestjs/common';
import { translate } from '../../../../common/i18n/translate';
import { NotificationListDto } from '../dto/notification-view.dto';
import { NOTIFICATION_REPOSITORY, NotificationRepository } from '../ports/notification.repository';

@Injectable()
export class ListNotificationsUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepository,
  ) {}

  async execute(criteria: {
    recipientId: string;
    unreadOnly?: boolean;
    page?: number;
    pageSize?: number;
    locale?: string;
  }): Promise<NotificationListDto> {
    const [page, unreadCount] = await Promise.all([
      this.notifications.findMany(criteria),
      this.notifications.countUnread(criteria.recipientId),
    ]);

    const targetLocale = criteria.locale;

    return {
      items: page.items.map((item) => {
        const title = targetLocale && item.titleKey
          ? translate(item.titleKey, item.titleParams ?? undefined, targetLocale)
          : item.title;
        const content = targetLocale && item.contentKey
          ? translate(item.contentKey, item.contentParams ?? undefined, targetLocale)
          : item.content;

        return {
          id: item.id,
          type: item.type,
          title,
          content,
          titleKey: item.titleKey,
          titleParams: item.titleParams,
          contentKey: item.contentKey,
          contentParams: item.contentParams,
          dossierCode: item.dossierCode,
          route: item.route,
          readAt: item.readAt,
          createdAt: item.createdAt,
        };
      }),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      unreadCount,
    };
  }
}
