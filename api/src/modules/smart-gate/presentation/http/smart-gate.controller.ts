import { Controller, Get, Param, Query } from '@nestjs/common';
import { GateEvaluation } from '../../../declarations/application/workflow-policy.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { CurrentAccess } from '../../../../common/auth/current-access.decorator';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { DashboardReadModelService } from '../../application/dashboard-read-model.service';
import { SmartGateRuleService } from '../../application/smart-gate-rule.service';

@ApiBearerAuth()
@ApiTags('Smart Gate')
@Controller('smart-gate')
export class SmartGateController {
  constructor(
    private readonly rules: SmartGateRuleService,
    private readonly dashboard: DashboardReadModelService,
  ) {}

  /**
   * Dashboard cũ của màn hình smart gate. Bản chính thức cho UI-02 là `GET /dashboard/overview`.
   * Số liệu ở đây được siết theo phạm vi dữ liệu của người gọi.
   */
  @RequirePermission('report.view')
  @Get('dashboard')
  getDashboard(@CurrentAccess() access: UserAccessContext) {
    return this.dashboard.getChiengKhuongDashboard(access);
  }

  @RequirePermission('gate.view')
  @Get('open-gate-rules')
  openGateRules() {
    return this.rules.getOpenGateRules();
  }

  @RequirePermission('gate.view')
  @Get('declarations/:id/gate-evaluation')
  evaluateGate(@Param('id') id: string, @Query('gate') gate?: GateEvaluation['gate']) {
    return this.rules.evaluateDeclaration(id, gate);
  }
}
