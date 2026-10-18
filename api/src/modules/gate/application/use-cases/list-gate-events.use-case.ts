import { Inject, Injectable } from '@nestjs/common';
import { PaginatedResult } from '../../../../common/http/pagination';
import { BorderFacilityService } from '../../../catalog/application/services/border-facility.service';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { GateEventView, toGateEventViewFromRow } from '../dto/gate-view.dto';
import { ListGateEventsCommand } from '../dto/record-gate-event.command';
import { GATE_EVENT_REPOSITORY, GateEventRepository } from '../ports/gate-event.repository';

/** Nhật ký sự kiện cổng (F38). Lọc theo hồ sơ, cổng và khoảng thời gian. */
@Injectable()
export class ListGateEventsUseCase {
  constructor(
    @Inject(GATE_EVENT_REPOSITORY)
    private readonly events: GateEventRepository,
    private readonly scope: DossierScopeService,
    private readonly facilities: BorderFacilityService,
  ) {}

  async execute(command: ListGateEventsCommand): Promise<PaginatedResult<GateEventView>> {
    const scope = this.scope.toCriteria(command.access);
    const [page, gates] = await Promise.all([
      this.events.findPage({
        dossierId: command.dossierId,
        dossierCode: command.dossierCode,
        plateNumber: command.plateNumber,
        gateCode: command.gateCode,
        direction: command.direction,
        decision: command.decision,
        actorName: command.actorName,
        from: command.from ? new Date(command.from) : undefined,
        to: command.to ? new Date(command.to) : undefined,
        page: command.page,
        pageSize: command.pageSize,
        unrestricted: scope.unrestricted,
        ownerUserId: scope.ownerUserId,
        taxCodes: scope.taxCodes,
      }),
      // Một lần đọc danh mục cổng để gắn tên; danh mục là cấu hình dùng chung nên không cần scope.
      this.facilities.listGates(),
    ]);
    const nameByCode = new Map(gates.map((gate) => [gate.code, gate.name]));
    return {
      ...page,
      items: page.items.map((row) => toGateEventViewFromRow(row, nameByCode.get(row.event.gateCode) ?? row.event.gateCode)),
    };
  }
}
