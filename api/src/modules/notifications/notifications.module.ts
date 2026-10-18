import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NOTIFICATION_PUBLISHER } from '../../common/notifications/notification-publisher.port';
import { AccessControlModule } from '../access-control/access-control.module';
import { NOTIFICATION_REPOSITORY } from './application/ports/notification.repository';
import { NotificationPublisherService } from './application/services/notification-publisher.service';
import { CountUnreadNotificationsUseCase } from './application/use-cases/count-unread-notifications.use-case';
import { ListNotificationsUseCase } from './application/use-cases/list-notifications.use-case';
import { MarkAllNotificationsReadUseCase } from './application/use-cases/mark-all-notifications-read.use-case';
import { MarkNotificationReadUseCase } from './application/use-cases/mark-notification-read.use-case';
import { NotificationOrmEntity } from './infrastructure/persistence/notification.orm-entity';
import { TypeOrmNotificationRepository } from './infrastructure/persistence/typeorm-notification.repository';
import { NotificationsController } from './presentation/http/notifications.controller';

/** `@Global()` để mọi phân hệ nghiệp vụ phát thông báo qua `NOTIFICATION_PUBLISHER` mà không phải import lại. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([NotificationOrmEntity]), AccessControlModule],
  controllers: [NotificationsController],
  providers: [
    { provide: NOTIFICATION_REPOSITORY, useClass: TypeOrmNotificationRepository },
    { provide: NOTIFICATION_PUBLISHER, useClass: NotificationPublisherService },
    ListNotificationsUseCase,
    CountUnreadNotificationsUseCase,
    MarkNotificationReadUseCase,
    MarkAllNotificationsReadUseCase,
  ],
  exports: [NOTIFICATION_PUBLISHER],
})
export class NotificationsModule {}
