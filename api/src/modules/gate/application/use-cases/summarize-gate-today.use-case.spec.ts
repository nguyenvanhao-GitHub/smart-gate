import { PaginatedResult } from '../../../../common/http/pagination';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { makeAccess } from '../../../declarations/testing/declaration.fixture';
import { GateDirection } from '../../../catalog/domain/border-facility.catalog';
import { GateDecision, GateEvent } from '../../domain/gate-event.entity';
import {
  GateEventPageCriteria,
  GateEventRepository,
  GateEventRow,
  GateEventSummary,
  GateEventSummaryCriteria,
} from '../ports/gate-event.repository';
import { InMemoryGateEventRepository } from '../../testing/gate.fixture';
import { SummarizeGateTodayUseCase } from './summarize-gate-today.use-case';

/** Nhân viên cổng phạm vi toàn hệ thống (`ALL`) — thấy mọi hồ sơ, không bị siết. */
const officer = makeAccess({
  userId: 'user-nhan-vien-cong',
  roles: [{ code: 'GATE_OFFICER', name: 'Nhân viên cổng', dataScope: DataScopeLevel.ALL }],
  permissions: ['gate.view'],
});

interface GateEventOptions {
  decision?: GateDecision;
  gateCode?: string;
  at?: Date;
  dossierId?: string;
}

/** Dựng một sự kiện cổng tối thiểu — chỉ đủ trường mà phép đếm KPI cần tới. */
function makeGateEvent(options: GateEventOptions = {}): GateEvent {
  return GateEvent.record({
    dossierId: options.dossierId ?? 'ho-so-1',
    gateCode: options.gateCode ?? 'B1',
    direction: GateDirection.EXIT,
    decision: options.decision ?? GateDecision.ALLOW,
    canOpen: options.decision !== GateDecision.DENY,
    statusColor: 'GREEN',
    blockingReasons: [],
    checklist: [],
    note: null,
    actorId: officer.userId,
    actorName: 'Nhân viên cổng',
    at: options.at ?? new Date(),
  });
}

const YESTERDAY = new Date(Date.now() - 26 * 60 * 60 * 1000);

/**
 * Kho sự kiện cổng **tôn trọng phạm vi dữ liệu** — gắn thêm chủ sở hữu (người tạo hồ sơ / mã số
 * thuế) cho từng dòng và áp đúng luật của `DossierScopeService`: `unrestricted` thì đếm hết, còn
 * `OWN` thì chỉ đếm hồ sơ của chính mình. In-memory fixture mặc định bỏ qua phạm vi nên không
 * kiểm được nhánh "hồ sơ ngoài phạm vi không tính"; kho này bù đúng chỗ đó.
 */
class ScopedGateEventRepository implements GateEventRepository {
  constructor(
    private readonly owned: { event: GateEvent; ownerUserId: string; taxCode: string | null }[] = [],
  ) {}

  async append(event: GateEvent): Promise<GateEvent> {
    this.owned.push({ event, ownerUserId: event.actorId, taxCode: null });
    return event;
  }

  async findLatestByDossier(): Promise<GateEvent | null> {
    return null;
  }

  async findAllowedDirections(): Promise<GateDirection[]> {
    return [];
  }

  async findPage(_criteria: GateEventPageCriteria): Promise<PaginatedResult<GateEventRow>> {
    return { items: [], total: 0, page: 1, pageSize: 1 };
  }

  async summarizeToday(criteria: GateEventSummaryCriteria): Promise<GateEventSummary> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const matched = this.owned.filter(
      (row) =>
        row.event.occurredAt >= startOfDay &&
        (!criteria.gateCode || row.event.gateCode === criteria.gateCode) &&
        (criteria.unrestricted || this.inScope(row, criteria)),
    );
    return {
      allowed: matched.filter((row) => row.event.decision === GateDecision.ALLOW).length,
      denied: matched.filter((row) => row.event.decision === GateDecision.DENY).length,
    };
  }

  /** Cùng luật với `DossierScopeService.isAccessible`: ưu tiên mã số thuế, ngã về người tạo. */
  private inScope(
    row: { ownerUserId: string; taxCode: string | null },
    criteria: GateEventSummaryCriteria,
  ): boolean {
    const taxCodes = criteria.taxCodes ?? [];
    if (taxCodes.length > 0) return !!row.taxCode && taxCodes.includes(row.taxCode);
    return row.ownerUserId === criteria.ownerUserId;
  }
}

function build(events: GateEventRepository) {
  const useCase = new SummarizeGateTodayUseCase(
    events,
    new DossierScopeService(new DataScopeService()),
  );
  return { useCase };
}

describe('SummarizeGateTodayUseCase — KPI lượt qua cổng trong ngày (UI-09)', () => {
  describe('Đếm lượt cho qua / từ chối hôm nay', () => {
    it('cộng đúng số ALLOW / DENY và tổng của mọi cổng khi không lọc', async () => {
      const events = new InMemoryGateEventRepository();
      await events.append(makeGateEvent({ decision: GateDecision.ALLOW, gateCode: 'A1' }));
      await events.append(makeGateEvent({ decision: GateDecision.ALLOW, gateCode: 'B1' }));
      await events.append(makeGateEvent({ decision: GateDecision.DENY, gateCode: 'B1' }));
      const { useCase } = build(events);

      const summary = await useCase.execute({ access: officer });

      expect(summary).toEqual({ gateCode: null, allowed: 2, denied: 1, total: 3 });
    });

    it('không có lượt nào hôm nay thì trả về 0 chứ không lỗi', async () => {
      const { useCase } = build(new InMemoryGateEventRepository());

      const summary = await useCase.execute({ access: officer });

      expect(summary).toEqual({ gateCode: null, allowed: 0, denied: 0, total: 0 });
    });

    it('bỏ qua sự kiện của ngày hôm trước — chỉ tính kể từ đầu ngày hôm nay', async () => {
      const events = new InMemoryGateEventRepository();
      await events.append(makeGateEvent({ decision: GateDecision.ALLOW }));
      await events.append(makeGateEvent({ decision: GateDecision.ALLOW, at: YESTERDAY }));
      await events.append(makeGateEvent({ decision: GateDecision.DENY, at: YESTERDAY }));
      const { useCase } = build(events);

      const summary = await useCase.execute({ access: officer });

      expect(summary).toEqual({ gateCode: null, allowed: 1, denied: 0, total: 1 });
    });
  });

  describe('Lọc theo một cổng', () => {
    it('chỉ đếm lượt của đúng cổng được chọn và ghi lại mã cổng đã lọc', async () => {
      const events = new InMemoryGateEventRepository();
      await events.append(makeGateEvent({ decision: GateDecision.ALLOW, gateCode: 'A1' }));
      await events.append(makeGateEvent({ decision: GateDecision.DENY, gateCode: 'A1' }));
      await events.append(makeGateEvent({ decision: GateDecision.ALLOW, gateCode: 'B1' }));
      const { useCase } = build(events);

      const summary = await useCase.execute({ gateCode: 'A1', access: officer });

      expect(summary).toEqual({ gateCode: 'A1', allowed: 1, denied: 1, total: 2 });
    });
  });

  describe('Tôn trọng phạm vi dữ liệu (scope-aware)', () => {
    it('phạm vi ALL: chuyển tiếp tiêu chí "không giới hạn" xuống kho', async () => {
      const events = new InMemoryGateEventRepository();
      const spy = jest.spyOn(events, 'summarizeToday');
      const { useCase } = build(events);

      await useCase.execute({ gateCode: 'B1', access: officer });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ gateCode: 'B1', unrestricted: true }),
      );
    });

    it('phạm vi OWN: chuyển tiếp đúng chủ sở hữu và không nới lỏng', async () => {
      const events = new InMemoryGateEventRepository();
      const spy = jest.spyOn(events, 'summarizeToday');
      const { useCase } = build(events);
      // makeAccess mặc định = tài khoản doanh nghiệp phạm vi OWN, userId 'user-dn-a'.
      const owner = makeAccess();

      await useCase.execute({ access: owner });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ unrestricted: false, ownerUserId: 'user-dn-a' }),
      );
    });

    it('hồ sơ ngoài phạm vi (của tài khoản khác) không được tính vào KPI', async () => {
      const events = new ScopedGateEventRepository([
        { event: makeGateEvent({ decision: GateDecision.ALLOW }), ownerUserId: 'user-dn-a', taxCode: null },
        { event: makeGateEvent({ decision: GateDecision.DENY }), ownerUserId: 'user-dn-a', taxCode: null },
        { event: makeGateEvent({ decision: GateDecision.ALLOW }), ownerUserId: 'user-khac', taxCode: null },
      ]);
      const { useCase } = build(events);

      const summary = await useCase.execute({ access: makeAccess() });

      // Chỉ 2 lượt của 'user-dn-a' được đếm; lượt của 'user-khac' bị loại.
      expect(summary).toEqual({ gateCode: null, allowed: 1, denied: 1, total: 2 });
    });

    it('phạm vi ALL đếm cả hồ sơ của nhiều tài khoản', async () => {
      const events = new ScopedGateEventRepository([
        { event: makeGateEvent({ decision: GateDecision.ALLOW }), ownerUserId: 'user-dn-a', taxCode: null },
        { event: makeGateEvent({ decision: GateDecision.ALLOW }), ownerUserId: 'user-khac', taxCode: null },
      ]);
      const { useCase } = build(events);

      const summary = await useCase.execute({ access: officer });

      expect(summary).toEqual({ gateCode: null, allowed: 2, denied: 0, total: 2 });
    });
  });
});
