import { Body, Controller, Get, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { AuthTokenPayload } from '../../../identity/application/services/auth-token.service';
import { FeeCatalogService, FeeItemsQuery } from '../../application/fee-catalog.service';
import { FeeExportRequest, FeeWorkbenchActionRequest } from './dto/fee.request';

const CSV_MIME = 'text/csv; charset=utf-8';

@ApiBearerAuth()
@ApiTags('Fees')
@Controller('fees')
export class FeesController {
  constructor(private readonly fees: FeeCatalogService) {}

  @RequirePermission('fee.view')
  @Get('screens')
  screens() {
    return this.fees.listScreens();
  }

  @RequirePermission('fee.view')
  @Get(':slug/items')
  items(@Param('slug') slug: string, @Query() query: FeeItemsQuery) {
    return this.fees.listItems(slug, query);
  }

  /**
   * Xuất đối soát phí ra CSV theo **đúng bộ lọc đang xem** (F51/F58). Xuất ở máy chủ để đọc số thật và
   * ghi được nhật ký ai xuất, lúc nào (BUG-028).
   */
  @RequirePermission('fee.export')
  @Get(':slug/export')
  async export(
    @Param('slug') slug: string,
    @Query() query: FeeExportRequest,
    @CurrentUser() actor: AuthTokenPayload,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.fees.exportItems(slug, query, { id: actor.sub, roles: actor.roles });
    response.setHeader('Content-Type', CSV_MIME);
    response.setHeader('Content-Length', String(result.content.length));
    response.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    return new StreamableFile(result.content);
  }

  /**
   * Mọi hành động thu/hủy/gộp phí đều là nghiệp vụ xác nhận nên yêu cầu `fee.approve`.
   * `:action` là **mã hành động** trong `FEE_ACTIONS` (ASCII), không phải nhãn nút tiếng Việt.
   * `note` (lý do/ghi chú) là **bắt buộc** — thiếu bị 400 (BUG-029).
   */
  @RequirePermission('fee.approve')
  @Post(':slug/actions/:action')
  action(
    @Param('slug') slug: string,
    @Param('action') action: string,
    @Body() body: FeeWorkbenchActionRequest,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    return this.fees.runAction(slug, action, { id: actor.sub, roles: actor.roles }, body);
  }
}
