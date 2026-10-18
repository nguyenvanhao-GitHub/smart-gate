import { Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { AuthenticatedOnly } from '../../../../common/auth/require-permission.decorator';
import { resolveLocale } from '../../../../common/i18n/translate';
import { AuthTokenPayload } from '../../../identity/application/services/auth-token.service';
import { CountUnreadNotificationsUseCase } from '../../application/use-cases/count-unread-notifications.use-case';
import { ListNotificationsUseCase } from '../../application/use-cases/list-notifications.use-case';
import { MarkAllNotificationsReadUseCase } from '../../application/use-cases/mark-all-notifications-read.use-case';
import { MarkNotificationReadUseCase } from '../../application/use-cases/mark-notification-read.use-case';
import { ListNotificationsRequest } from './dto/list-notifications.request';

/** Thông báo là dữ liệu cá nhân: ai đăng nhập cũng chỉ đọc được của chính mình, không cần quyền riêng. */
@ApiBearerAuth()
@ApiTags('Notifications')
@AuthenticatedOnly()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly listNotifications: ListNotificationsUseCase,
    private readonly countUnread: CountUnreadNotificationsUseCase,
    private readonly markRead: MarkNotificationReadUseCase,
    private readonly markAllRead: MarkAllNotificationsReadUseCase,
  ) {}

  @Get()
  list(
    @Query() query: ListNotificationsRequest,
    @CurrentUser() actor: AuthTokenPayload,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.listNotifications.execute({
      recipientId: actor.sub,
      unreadOnly: query.unreadOnly,
      page: query.page,
      pageSize: query.pageSize,
      locale: resolveLocale(acceptLanguage),
    });
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() actor: AuthTokenPayload) {
    return this.countUnread.execute(actor.sub);
  }

  @Post('actions/read-all')
  readAll(@CurrentUser() actor: AuthTokenPayload) {
    return this.markAllRead.execute(actor.sub);
  }

  @Post(':id/actions/read')
  read(@Param('id') id: string, @CurrentUser() actor: AuthTokenPayload) {
    return this.markRead.execute(id, actor.sub);
  }
}
