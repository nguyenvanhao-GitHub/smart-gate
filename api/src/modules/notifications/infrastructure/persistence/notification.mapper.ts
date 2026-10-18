import { Notification } from '../../domain/notification.entity';
import { NotificationOrmEntity } from './notification.orm-entity';

export class NotificationMapper {
  static toDomain(row: NotificationOrmEntity): Notification {
    return new Notification(
      row.id,
      row.recipientId,
      row.type,
      row.title,
      row.content,
      row.dossierId,
      row.dossierCode,
      row.route,
      row.readAt,
      row.createdAt,
      row.titleKey ?? null,
      row.titleParams ?? null,
      row.contentKey ?? null,
      row.contentParams ?? null,
    );
  }

  static toPersistence(notification: Notification): NotificationOrmEntity {
    const row = new NotificationOrmEntity();
    row.id = notification.id;
    row.recipientId = notification.recipientId;
    row.type = notification.type;
    row.title = notification.title;
    row.content = notification.content;
    row.dossierId = notification.dossierId;
    row.dossierCode = notification.dossierCode;
    row.route = notification.route;
    row.readAt = notification.readAt;
    row.createdAt = notification.createdAt;
    row.titleKey = notification.titleKey;
    row.titleParams = notification.titleParams;
    row.contentKey = notification.contentKey;
    row.contentParams = notification.contentParams;
    return row;
  }
}
