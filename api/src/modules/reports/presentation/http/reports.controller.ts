import { Body, Controller, Get, Param, Post, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { CurrentAccess } from '../../../../common/auth/current-access.decorator';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { AuthTokenPayload } from '../../../identity/application/services/auth-token.service';
import { ExportReportUseCase } from '../../application/use-cases/export-report.use-case';
import { ListReportCatalogUseCase } from '../../application/use-cases/list-report-catalog.use-case';
import { RunReportUseCase } from '../../application/use-cases/run-report.use-case';
import { ReportQueryRequest } from './dto/report-query.request';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiBearerAuth()
@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly listCatalog: ListReportCatalogUseCase,
    private readonly runReport: RunReportUseCase,
    private readonly exportReport: ExportReportUseCase,
  ) {}

  @RequirePermission('report.view')
  @Get('catalog')
  catalog() {
    return this.listCatalog.execute();
  }

  @RequirePermission('report.view')
  @Post(':code/query')
  query(
    @Param('code') code: string,
    @Body() body: ReportQueryRequest,
    @CurrentAccess() access: UserAccessContext,
  ) {
    return this.runReport.execute({
      code,
      filter: this.toFilter(body),
      page: body.page,
      pageSize: body.pageSize,
      access,
    });
  }

  /**
   * Xuất Excel theo **đúng bộ lọc đang xem** và **đúng phạm vi dữ liệu** của người gọi (F58).
   * Mọi lần xuất đều được ghi nhật ký kiểm toán trong use-case.
   */
  @RequirePermission('report.export')
  @Post(':code/export')
  async export(
    @Param('code') code: string,
    @Body() body: ReportQueryRequest,
    @CurrentAccess() access: UserAccessContext,
    @CurrentUser() actor: AuthTokenPayload,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.exportReport.execute({
      code,
      filter: this.toFilter(body),
      access,
      actorId: actor.sub,
      actorName: actor.username,
      actorRole: actor.roles.join('+'),
    });

    response.setHeader('Content-Type', XLSX_MIME);
    response.setHeader('Content-Length', String(result.content.length));
    response.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    return new StreamableFile(result.content);
  }

  /** Bỏ `page`/`pageSize` khỏi bộ lọc — hai tham số đó là phân trang, không phải điều kiện lọc. */
  private toFilter(body: ReportQueryRequest) {
    return {
      from: body.from,
      to: body.to,
      checkpoint: body.checkpoint,
      type: body.type,
      status: body.status,
      agencyCode: body.agencyCode,
    };
  }
}
