import { translate } from '../../i18n/translate';
import { NotificationPublisher, PublishNotificationInput } from '../notification-publisher.port';

/** Cổng phát thông báo giả — ghi lại mọi thông báo để test kiểm nội dung đã phát. */
export class FakeNotificationPublisher implements NotificationPublisher {
  readonly published: PublishNotificationInput[] = [];

  async publish(input: PublishNotificationInput): Promise<void> {
    const title = input.titleKey
      ? translate(input.titleKey, input.titleParams, 'vi')
      : input.title;
    const content = input.contentKey
      ? translate(input.contentKey, input.contentParams, 'vi')
      : input.content;

    this.published.push({
      ...input,
      title,
      content,
    });
  }
}
