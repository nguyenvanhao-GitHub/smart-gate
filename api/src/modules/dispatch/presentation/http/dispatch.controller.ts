import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { CurrentAccess } from '../../../../common/auth/current-access.decorator';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { AuthTokenPayload } from '../../../identity/application/services/auth-token.service';
import { AssignDispatchUseCase } from '../../application/use-cases/assign-dispatch.use-case';
import { CallNextDispatchUseCase } from '../../application/use-cases/call-next-dispatch.use-case';
import { ChangeInspectionUseCase } from '../../application/use-cases/change-inspection.use-case';
import { GetDispatchBoardUseCase } from '../../application/use-cases/get-dispatch-board.use-case';
import { GetDispatchHistoryUseCase } from '../../application/use-cases/get-dispatch-history.use-case';
import { MoveDispatchUseCase } from '../../application/use-cases/move-dispatch.use-case';
import { ReleaseDispatchUseCase } from '../../application/use-cases/release-dispatch.use-case';
import { AssignDispatchRequest, MoveDispatchRequest } from './dto/assign-dispatch.request';
import { CallNextDispatchRequest } from './dto/call-next-dispatch.request';
import { DispatchBoardRequest } from './dto/dispatch-board.request';
import { DispatchHistoryRequest } from './dto/dispatch-history.request';
import { InspectionRequest } from './dto/inspection.request';
import { appBadRequest } from '../../../../common/i18n';

import { parseFilterEndDate, parseFilterStartDate } from '../../../../common/time/vietnam-date';

const ASSIGNMENT_ID_PIPE = new ParseUUIDPipe({
  exceptionFactory: () => appBadRequest('dispatch.idInvalid'),
});

@ApiBearerAuth()
@ApiTags('Dispatch')
@Controller('dispatch')
export class DispatchController {
  constructor(
    private readonly board: GetDispatchBoardUseCase,
    private readonly assign: AssignDispatchUseCase,
    private readonly move: MoveDispatchUseCase,
    private readonly release: ReleaseDispatchUseCase,
    private readonly inspection: ChangeInspectionUseCase,
    private readonly history: GetDispatchHistoryUseCase,
    private readonly callNextUseCase: CallNextDispatchUseCase,
  ) {}

  /**
   * Bảng điều phối dạng cột + KPI tải (UI-08).
   * Nhận cả các quyền hành động trên bảng: sau khi gán (`dispatch.create`), chuyển (`dispatch.update`),
   * bỏ vị trí (`dispatch.delete`) hoặc đổi trạng thái kiểm tra (`yard.update`), web tải lại bảng ngay
   * (`load(silent)`). Ai được thao tác điều phối thì phải đọc lại được bảng vừa tác động.
   */
  @RequirePermission('dispatch.view', 'dispatch.create', 'dispatch.update', 'dispatch.delete', 'yard.update')
  @Get('board')
  getBoard(@Query() query: DispatchBoardRequest, @CurrentAccess() access: UserAccessContext) {
    return this.board.execute({
      checkpoint: query.checkpoint,
      date: query.date,
      from: parseFilterStartDate(query.from),
      to: parseFilterEndDate(query.to),
      search: query.search,
      access,
    });
  }

  /**
   * Lịch sử gán/chuyển/bỏ vị trí điều phối (F33): tra theo hồ sơ, thời gian và cán bộ.
   * Nhận cả quyền hành động điều phối: cán bộ tự tay gán/chuyển/bỏ vị trí thì đương nhiên đọc được
   * lịch sử chính các thao tác đó (bảng điều phối tải kèm lịch sử gần đây).
   */
  @RequirePermission('dispatch.view', 'dispatch.create', 'dispatch.update', 'dispatch.delete')
  @Get('history')
  getHistory(@Query() query: DispatchHistoryRequest, @CurrentAccess() access: UserAccessContext) {
    return this.history.execute({
      dossierId: query.dossierId,
      dossierCode: query.dossierCode,
      actor: query.actor,
      from: parseFilterStartDate(query.from),
      to: parseFilterEndDate(query.to),
      page: query.page,
      pageSize: query.pageSize,
      access,
    });
  }

  /** Gán cổng/làn/ô đỗ (F29, F31). Xe đã có vị trí khác hoặc ô đỗ đã có xe → **409**. */
  @RequirePermission('dispatch.create')
  @Post('assignments')
  create(
    @Body() body: AssignDispatchRequest,
    @CurrentAccess() access: UserAccessContext,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    return this.assign.execute({ ...body, actorId: actor.sub, access });
  }

  /** Chuyển vị trí. Trường không gửi lên thì giữ nguyên, gửi `null` là bỏ trống. */
  @RequirePermission('dispatch.update')
  @Patch('assignments/:id')
  update(
    @Param('id', ASSIGNMENT_ID_PIPE) id: string,
    @Body() body: MoveDispatchRequest,
    @CurrentAccess() access: UserAccessContext,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    return this.move.execute({ ...body, assignmentId: id, actorId: actor.sub, access });
  }

  /**
   * Cập nhật trạng thái kiểm tra/tập kết của xe đang đỗ (F44): chờ kiểm tra → đang kiểm tra →
   * hoàn thành → sang tải/tập kết. Sai thứ tự → **409**. Dùng quyền `yard.update`.
   */
  @RequirePermission('yard.update')
  @Post('assignments/:id/actions/inspection')
  updateInspection(
    @Param('id', ASSIGNMENT_ID_PIPE) id: string,
    @Body() body: InspectionRequest,
    @CurrentAccess() access: UserAccessContext,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    return this.inspection.execute({ assignmentId: id, status: body.status, note: body.note, actorId: actor.sub, access });
  }

  /** Giải phóng vị trí (F44). Gọi lại trên vị trí đã giải phóng không báo lỗi. */
  @RequirePermission('dispatch.delete')
  @Delete('assignments/:id')
  remove(
    @Param('id', ASSIGNMENT_ID_PIPE) id: string,
    @CurrentAccess() access: UserAccessContext,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    return this.release.execute({ assignmentId: id, actorId: actor.sub, access });
  }

  /**
   * Gọi số tiếp theo vào kiểm tra chuyên ngành (UI-08 · SG-60 · Điều phối bãi).
   * Lấy số thứ tự nhỏ nhất trong hàng đợi chờ gọi và chuyển hồ sơ sang BUSINESS_PROCESSING.
   */
  @RequirePermission('dispatch.create', 'dispatch.update', 'yard.update')
  @Post('call-next')
  callNext(
    @Body() body: CallNextDispatchRequest,
    @CurrentAccess() access: UserAccessContext,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    return this.callNextUseCase.execute({
      checkpoint: body.checkpoint,
      date: body.date,
      from: parseFilterStartDate(body.from),
      to: parseFilterEndDate(body.to),
      dossierId: body.dossierId,
      actorId: actor.sub,
      access,
    });
  }
}
