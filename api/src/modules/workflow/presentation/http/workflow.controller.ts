import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { CurrentAccess } from '../../../../common/auth/current-access.decorator';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { AuthTokenPayload } from '../../../identity/application/services/auth-token.service';
import { DecideWorkflowStepUseCase } from '../../application/use-cases/decide-workflow-step.use-case';
import { GetWorkflowDossierUseCase } from '../../application/use-cases/get-workflow-dossier.use-case';
import { ListWorkflowQueueUseCase } from '../../application/use-cases/list-workflow-queue.use-case';
import { QueueTab } from '../../domain/workflow.enums';
import { DecideStepRequest } from './dto/decide-step.request';
import { ListQueueRequest } from './dto/list-queue.request';
import { parseFilterEndDate, parseFilterStartDate } from '../../../../common/time/vietnam-date';
import { appBadRequest } from '../../../../common/i18n';

const DOSSIER_ID_PIPE = new ParseUUIDPipe({
  exceptionFactory: () => appBadRequest('dossier.idInvalid'),
});

@ApiBearerAuth()
@ApiTags('Workflow')
@Controller('workflow')
export class WorkflowController {
  constructor(
    private readonly listQueue: ListWorkflowQueueUseCase,
    private readonly getDossier: GetWorkflowDossierUseCase,
    private readonly decideStep: DecideWorkflowStepUseCase,
  ) {}

  /**
   * Hàng đợi liên ngành (UI-06). Mặc định tab "cần xử lý".
   * "Ai được thao tác thì đương nhiên được đọc": nhận cả `workflow.approve`/`workflow.update` để một
   * vai trò chỉ có quyền hành động (không kèm `workflow.view`) vẫn xem được hàng đợi mình phải xử lý.
   */
  @RequirePermission('workflow.view', 'workflow.approve', 'workflow.update')
  @Get('queue')
  queue(@Query() query: ListQueueRequest, @CurrentAccess() access: UserAccessContext) {
    return this.listQueue.execute({
      access,
      tab: query.tab ?? QueueTab.TODO,
      keyword: query.keyword,
      type: query.type,
      status: query.status,
      checkpoint: query.checkpoint,
      from: parseFilterStartDate(query.from),
      to: parseFilterEndDate(query.to),
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /**
   * Màn hình xử lý nghiệp vụ (UI-07).
   * Nhận cả `workflow.approve`/`workflow.update`: sau khi ghi quyết định, web tải lại hồ sơ ngay
   * (`load(silent)`). Nếu endpoint đọc này chỉ đòi `workflow.view` thì vai trò chỉ có quyền hành động
   * sẽ duyệt xong nhưng bị 403 khi tải lại → hiện toast đỏ "không có quyền xem" gây hiểu nhầm dù hành
   * động đã hoàn tất. Ai được thao tác một hồ sơ thì phải đọc lại được chính hồ sơ đó.
   */
  @RequirePermission('workflow.view', 'workflow.approve', 'workflow.update')
  @Get('dossiers/:id')
  dossier(@Param('id', DOSSIER_ID_PIPE) id: string, @CurrentAccess() access: UserAccessContext) {
    return this.getDossier.execute(id, access);
  }

  /**
   * Ghi quyết định lên bước hiện tại (CR36 — 3 lựa chọn: APPROVE = "Xác nhận hoàn thành",
   * REQUEST_SUPPLEMENT, REJECT). Sai thứ tự bước → **409**, thiếu mã nguyên nhân bắt buộc → 400.
   * `workflow.update` đủ để yêu cầu sửa đổi, bổ sung; xác nhận hoàn thành/từ chối cần `workflow.approve`.
   * Bước cổng (vào/ra) do sự kiện cổng khép nên không quyết định được ở đây (→ 409).
   */
  @RequirePermission('workflow.approve', 'workflow.update')
  @Post('dossiers/:id/actions/decide')
  decide(
    @Param('id', DOSSIER_ID_PIPE) id: string,
    @Body() body: DecideStepRequest,
    @CurrentAccess() access: UserAccessContext,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    return this.decideStep.execute({
      dossierId: id,
      stepCode: body.stepCode,
      decision: body.decision,
      reasonCode: body.reasonCode,
      reasonNote: body.reasonNote,
      checklist: body.checklist,
      actorId: actor.sub,
      actorRole: actor.roles.join('+'),
      access,
    });
  }
}
