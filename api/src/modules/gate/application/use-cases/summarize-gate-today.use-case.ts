import { Inject, Injectable } from '@nestjs/common';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { GateTodaySummaryView } from '../dto/gate-view.dto';
import { GateSummaryCommand } from '../dto/record-gate-event.command';
import { GATE_EVENT_REPOSITORY, GateEventRepository } from '../ports/gate-event.repository';

/**
 * KPI cổng trong ngày (UI-09): đếm lượt cho qua (`ALLOW`) và từ chối (`DENY`) kể từ đầu ngày,
 * tùy chọn theo một cổng. Cùng phạm vi dữ liệu với nhật ký — không nới lỏng khi tổng hợp.
 */
@Injectable()
export class SummarizeGateTodayUseCase {
  constructor(
    @Inject(GATE_EVENT_REPOSITORY)
    private readonly events: GateEventRepository,
    private readonly scope: DossierScopeService,
  ) {}

  async execute(command: GateSummaryCommand): Promise<GateTodaySummaryView> {
    const scope = this.scope.toCriteria(command.access);
    const summary = await this.events.summarizeToday({
      gateCode: command.gateCode,
      unrestricted: scope.unrestricted,
      ownerUserId: scope.ownerUserId,
      taxCodes: scope.taxCodes,
    });
    return {
      gateCode: command.gateCode ?? null,
      allowed: summary.allowed,
      denied: summary.denied,
      total: summary.allowed + summary.denied,
    };
  }
}
