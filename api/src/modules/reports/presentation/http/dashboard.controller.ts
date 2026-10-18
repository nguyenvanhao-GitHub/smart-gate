import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { CurrentAccess } from '../../../../common/auth/current-access.decorator';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { GetDashboardOverviewUseCase } from '../../application/use-cases/get-dashboard-overview.use-case';
import { DashboardOverviewRequest } from './dto/dashboard-overview.request';

/**
 * Dashboard tổng quan (UI-02). Xếp vào phân hệ Báo cáo vì đây là số liệu tổng hợp — quyền
 * `report.view`, còn phạm vi dữ liệu do use-case siết theo `data_scope` của người dùng.
 */
@ApiBearerAuth()
@ApiTags('Reports')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly overviewUseCase: GetDashboardOverviewUseCase) {}

  @RequirePermission('report.view')
  @Get('overview')
  overview(@Query() query: DashboardOverviewRequest, @CurrentAccess() access: UserAccessContext) {
    return this.overviewUseCase.execute({
      from: query.from,
      to: query.to,
      checkpoint: query.checkpoint,
      access,
    });
  }
}
