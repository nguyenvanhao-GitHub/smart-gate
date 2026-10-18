import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { makeAccess } from '../../../declarations/testing/declaration.fixture';
import { makeFacilities } from '../../../dispatch/testing/dispatch.fixture';
import { GateDirection } from '../../../catalog/domain/border-facility.catalog';
import { GateDecision, GateEvent } from '../../domain/gate-event.entity';
import { InMemoryGateEventRepository } from '../../testing/gate.fixture';
import { ListGateEventsUseCase } from './list-gate-events.use-case';

/** Nhân viên cổng phạm vi toàn hệ thống — không bị siết khi liệt kê nhật ký. */
const officer = makeAccess({
  userId: 'user-nhan-vien-cong',
  roles: [{ code: 'GATE_OFFICER', name: 'Nhân viên cổng', dataScope: DataScopeLevel.ALL }],
  permissions: ['gate.view'],
});

function makeGateEvent(gateCode: string): GateEvent {
  return GateEvent.record({
    dossierId: 'ho-so-1',
    gateCode,
    direction: GateDirection.EXIT,
    decision: GateDecision.ALLOW,
    canOpen: true,
    statusColor: 'GREEN',
    blockingReasons: [],
    checklist: [],
    note: null,
    actorId: officer.userId,
    actorName: 'Nhân viên cổng',
  });
}

function build(events: InMemoryGateEventRepository) {
  const useCase = new ListGateEventsUseCase(
    events,
    new DossierScopeService(new DataScopeService()),
    makeFacilities(),
  );
  return { useCase };
}

describe('ListGateEventsUseCase — gắn tên cổng cho từng dòng nhật ký (F38)', () => {
  it('tra tên cổng từ danh mục theo mã cổng của sự kiện', async () => {
    const events = new InMemoryGateEventRepository();
    await events.append(makeGateEvent('A1'));
    const { useCase } = build(events);

    const page = await useCase.execute({ access: officer });

    expect(page.items).toHaveLength(1);
    expect(page.items[0].gateCode).toBe('A1');
    // makeFacilities khai 'A1' → 'Cửa A1 - Nhập cảnh'.
    expect(page.items[0].gateName).toBe('Cửa A1 - Nhập cảnh');
  });

  it('mã cổng không có trong danh mục thì lấy chính mã làm tên (fallback)', async () => {
    const events = new InMemoryGateEventRepository();
    await events.append(makeGateEvent('ZZ'));
    const { useCase } = build(events);

    const page = await useCase.execute({ access: officer });

    expect(page.items[0].gateName).toBe('ZZ');
  });

  it('mỗi dòng được gắn tên theo đúng mã cổng của riêng nó', async () => {
    const events = new InMemoryGateEventRepository();
    await events.append(makeGateEvent('A1'));
    await events.append(makeGateEvent('B1'));
    const { useCase } = build(events);

    const page = await useCase.execute({ access: officer });

    const nameByCode = new Map(page.items.map((item) => [item.gateCode, item.gateName]));
    expect(nameByCode.get('A1')).toBe('Cửa A1 - Nhập cảnh');
    expect(nameByCode.get('B1')).toBe('Cửa B1 - Xuất cảnh');
  });

  it('lọc nhật ký theo các tiêu chí: cổng, hướng, kết quả, người xử lý', async () => {
    const events = new InMemoryGateEventRepository();
    await events.append(makeGateEvent('A1'));
    await events.append(
      GateEvent.record({
        dossierId: 'ho-so-2',
        gateCode: 'B1',
        direction: GateDirection.EXIT,
        decision: GateDecision.DENY,
        canOpen: false,
        statusColor: 'RED',
        blockingReasons: ['Chưa thanh toán'],
        checklist: [],
        note: 'Từ chối',
        actorId: 'user-2',
        actorName: 'Cán bộ B',
      }),
    );
    const { useCase } = build(events);

    // Lọc theo cổng A1
    const byGate = await useCase.execute({ gateCode: 'A1', access: officer });
    expect(byGate.items).toHaveLength(1);
    expect(byGate.items[0].gateCode).toBe('A1');

    // Lọc theo decision DENY
    const byDecision = await useCase.execute({ decision: GateDecision.DENY, access: officer });
    expect(byDecision.items).toHaveLength(1);
    expect(byDecision.items[0].decision).toBe('DENY');

    // Lọc theo actorName
    const byActor = await useCase.execute({ actorName: 'Cán bộ B', access: officer });
    expect(byActor.items).toHaveLength(1);
    expect(byActor.items[0].actorName).toBe('Cán bộ B');
  });
});
