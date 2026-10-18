import { Body, Controller, Get, Inject, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { AuthenticatedOnly, RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { AUDIT_LOGGER, AuditLogger, AuditResult } from '../../../../common/audit/audit-logger.port';
import { AuthTokenPayload } from '../../../identity/application/services/auth-token.service';
import { ExportAuditLogsUseCase } from '../../application/use-cases/export-audit-logs.use-case';
import { ListAuditLogsUseCase } from '../../application/use-cases/list-audit-logs.use-case';
import { parseFilterEndDate, parseFilterStartDate } from '../../../../common/time/vietnam-date';
import { ListAuditLogsRequest } from './dto/list-audit-logs.request';
import { LogExportResultDto } from './dto/log-export-result.dto';

const CSV_MIME = 'text/csv; charset=utf-8';

@ApiBearerAuth()
@ApiTags('Audit')
@Controller('audit-logs')
export class AuditLogsController {
  constructor(
    private readonly listAuditLogs: ListAuditLogsUseCase,
    private readonly exportAuditLogs: ExportAuditLogsUseCase,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  /** Nhật ký hệ thống chưa có phân hệ quyền riêng nên dùng mã gần nhất là `system.view`. */
  @RequirePermission('system.view')
  @Get()
  list(@Query() query: ListAuditLogsRequest) {
    return this.listAuditLogs.execute({
      actor: query.actor,
      action: query.action,
      actions: query.actions,
      module: query.module,
      target: query.target,
      from: parseFilterStartDate(query.from),
      to: parseFilterEndDate(query.to),
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /**
   * Xuất nhật ký ra CSV theo **đúng bộ lọc đang xem** (F58). Mọi lần xuất được ghi nhật ký
   * `REPORT_EXPORT` trong use-case — biết ai xuất, lúc nào, bộ lọc gì (BUG-027).
   */
  @RequirePermission('system.view')
  @Get('export')
  async export(
    @Query() query: ListAuditLogsRequest,
    @CurrentUser() actor: AuthTokenPayload,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.exportAuditLogs.execute({
      actor: query.actor,
      action: query.action,
      actions: query.actions,
      module: query.module,
      target: query.target,
      from: parseFilterStartDate(query.from),
      to: parseFilterEndDate(query.to),
      actorId: actor.sub,
      actorRole: actor.roles.join('+'),
    });

    response.setHeader('Content-Type', CSV_MIME);
    response.setHeader('Content-Length', String(result.content.length));
    response.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    return new StreamableFile(result.content);
  }

  /** SG-225: Ghi nhận kết quả xuất file từ client (thành công, hủy, hoặc thất bại) vào Nhật ký thao tác. */
  @AuthenticatedOnly()
  @Post('export-result')
  async logExportResult(
    @Body() body: LogExportResultDto,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    let note = 'File được tạo và lưu thành công.';
    if (body.result === AuditResult.CANCELLED) {
      note = 'Người dùng chủ động hủy/thoát thao tác lưu file.';
    } else if (body.result === AuditResult.FAILURE) {
      note = 'Hệ thống xảy ra lỗi và không thể hoàn tất việc xuất file.';
    }

    await this.auditLogger.record({
      action: body.action ?? 'REPORT_EXPORT',
      targetType: body.targetType ?? 'REPORT',
      targetId: body.targetId ?? 'export',
      result: body.result,
      actorId: actor.sub,
      actorRole: actor.roles.join('+'),
      after: {
        reportName: body.reportName ?? 'Xuất tệp',
        filter: body.filter ?? null,
        note,
      },
    });
    return { success: true };
  }
}
