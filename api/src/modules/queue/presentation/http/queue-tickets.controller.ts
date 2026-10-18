import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { CurrentAccess } from '../../../../common/auth/current-access.decorator';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { AuthTokenPayload } from '../../../identity/application/services/auth-token.service';
import { IssueQueueTicketUseCase } from '../../application/use-cases/issue-queue-ticket.use-case';
import { IssueQueueTicketRequest } from './dto/issue-queue-ticket.request';

@ApiBearerAuth()
@ApiTags('Queue')
@Controller('queue-tickets')
export class QueueTicketsController {
  constructor(private readonly issueTicket: IssueQueueTicketUseCase) {}

  /**
   * Cấp số thứ tự cho hồ sơ (F27) — gắn **một số thứ tự duy nhất** cho hồ sơ trong ngày. Cấp lại
   * trong cùng ngày trả về đúng số đã cấp.
   *
   * BUG-070: chỉ trả **201 Created** khi thực sự sinh số mới; hồ sơ đã có số thì đây là thao tác
   * idempotent (không tạo bản ghi) nên trả **200 OK** cùng đúng bản ghi cũ.
   */
  @RequirePermission('queue.create')
  @Post()
  async issue(
    @Body() body: IssueQueueTicketRequest,
    @CurrentAccess() access: UserAccessContext,
    @CurrentUser() actor: AuthTokenPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.issueTicket.execute({ dossierId: body.dossierId, actorId: actor.sub, access });
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.ticket;
  }
}
