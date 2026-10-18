import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { CurrentAccess } from '../../../../common/auth/current-access.decorator';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { AuthTokenPayload } from '../../../identity/application/services/auth-token.service';
import { ListGateEventsUseCase } from '../../application/use-cases/list-gate-events.use-case';
import { LookupGateDossierUseCase } from '../../application/use-cases/lookup-gate-dossier.use-case';
import { RecordGateEventUseCase } from '../../application/use-cases/record-gate-event.use-case';
import { SummarizeGateTodayUseCase } from '../../application/use-cases/summarize-gate-today.use-case';
import { GateLookupRequest, GateSummaryRequest, ListGateEventsRequest } from './dto/gate-query.request';
import { RecordGateEventRequest } from './dto/record-gate-event.request';

@ApiBearerAuth()
@ApiTags('Gate')
@Controller('gate')
export class GateController {
  constructor(
    private readonly lookup: LookupGateDossierUseCase,
    private readonly recordEvent: RecordGateEventUseCase,
    private readonly listEvents: ListGateEventsUseCase,
    private readonly summarize: SummarizeGateTodayUseCase,
  ) {}

  /**
   * Tra cứu hồ sơ theo mã tại cổng (UI-09) kèm đánh giá điều kiện và checklist.
   * Chưa làm quét QR — điểm C2 chưa chốt thiết bị.
   * Nhận cả `gate.approve` (quyền ghi nhận sự kiện cổng): sau khi cho qua/từ chối, web tra cứu lại
   * ngay (`refreshLookup`). Ai được thao tác cổng thì phải đọc lại được kết quả tra cứu.
   */
  @RequirePermission('gate.view', 'gate.approve')
  @Get('lookup')
  lookupDossier(@Query() query: GateLookupRequest, @CurrentAccess() access: UserAccessContext) {
    return this.lookup.execute({ code: query.code, gateCode: query.gateCode, direction: query.direction, access });
  }

  /**
   * Ghi nhận sự kiện cổng (F38). Xác nhận cho qua (`ALLOW`) khi chưa đủ điều kiện → **409** kèm
   * `blockingReasons` liệt kê đúng những gì còn thiếu (F39).
   */
  @RequirePermission('gate.approve')
  @HttpCode(HttpStatus.OK)
  @Post('events')
  record(
    @Body() body: RecordGateEventRequest,
    @CurrentAccess() access: UserAccessContext,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    return this.recordEvent.execute({
      dossierId: body.dossierId,
      gateCode: body.gateCode,
      direction: body.direction,
      decision: body.decision,
      checklist: body.checklist,
      note: body.note,
      prioritizeQuarantine: body.prioritizeQuarantine,
      actorId: actor.sub,
      actorName: actor.username,
      access,
    });
  }

  /** KPI cổng trong ngày (UI-09): lượt cho qua / từ chối hôm nay, tùy chọn theo cổng. */
  @RequirePermission('gate.view', 'gate.approve')
  @Get('summary')
  summary(@Query() query: GateSummaryRequest, @CurrentAccess() access: UserAccessContext) {
    return this.summarize.execute({ gateCode: query.gateCode, access });
  }

  @RequirePermission('gate.view', 'gate.approve')
  @Get('events')
  events(@Query() query: ListGateEventsRequest, @CurrentAccess() access: UserAccessContext) {
    return this.listEvents.execute({
      dossierId: query.dossierId,
      dossierCode: query.dossierCode,
      plateNumber: query.plateNumber,
      gateCode: query.gateCode,
      direction: query.direction,
      decision: query.decision,
      actorName: query.actorName,
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.pageSize,
      access,
    });
  }
}
