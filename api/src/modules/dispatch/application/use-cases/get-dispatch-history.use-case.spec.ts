import { ForbiddenException } from '@nestjs/common';
import { PaginatedResult } from '../../../../common/http/pagination';
import { AuditResult } from '../../../../common/audit/audit-logger.port';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { AuditLog } from '../../../audit/domain/audit-log.entity';
import { AuditLogRepository, AuditLogSearchCriteria } from '../../../audit/application/ports/audit-log.repository';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { InMemoryDeclarationRepository, makeAccess, makeDeclaration } from '../../../declarations/testing/declaration.fixture';
import { QueueFlow, QueueTicket } from '../../../queue/domain/queue-ticket.entity';
import { InMemoryQueueTicketRepository } from '../../../queue/testing/queue.fixture';
import { InMemoryYardRepository } from '../../testing/dispatch.fixture';
import { GetDispatchHistoryUseCase } from './get-dispatch-history.use-case';

/** Cán bộ điều phối phạm vi toàn hệ thống — không bị siết theo doanh nghiệp. */
const dispatcher = makeAccess({
  userId: 'user-dieu-phoi',
  roles: [{ code: 'DISPATCHER', name: 'Điều phối viên', dataScope: DataScopeLevel.ALL }],
  permissions: ['dispatch.view'],
});

/** Tài khoản doanh nghiệp phạm vi OWN, gắn đúng một mã số thuế khác chủ hồ sơ. */
const otherEnterprise = makeAccess({
  userId: 'user-dn-khac',
  roles: [{ code: 'DN', name: 'Doanh nghiệp', dataScope: DataScopeLevel.OWN }],
  permissions: ['dispatch.view'],
  assignments: [{ type: 'TAX_CODE', value: '9999999999' }],
});

/** Dựng một bản ghi audit với mốc thời gian kiểm soát được (để test sắp mới nhất trước). */
function makeAuditLog(input: {
  id: string;
  at: Date;
  action: string;
  targetId?: string | null;
  actorId?: string | null;
  actorUsername?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}): AuditLog {
  return new AuditLog(
    input.id,
    input.at,
    input.actorId ?? null,
    input.actorUsername ?? null,
    'DISPATCHER',
    null,
    null,
    input.action,
    'DECLARATION',
    input.targetId ?? null,
    AuditResult.SUCCESS,
    input.before ?? null,
    input.after ?? null,
  );
}

/**
 * Kho audit trong bộ nhớ — lọc theo `actions`/`targetId`/`actor`/`from`/`to` và **sắp mới nhất trước**,
 * đúng như repository thật, để use-case chỉ còn lo phần dịch mã hồ sơ và kiểm phạm vi.
 */
class FakeAuditLogRepository implements AuditLogRepository {
  readonly calls: AuditLogSearchCriteria[] = [];
  constructor(private readonly logs: AuditLog[] = []) {}

  async save(): Promise<void> {
    // Không cần cho test tra cứu.
  }

  async findMany(criteria: AuditLogSearchCriteria): Promise<PaginatedResult<AuditLog>> {
    this.calls.push(criteria);
    let items = [...this.logs];
    if (criteria.actions) items = items.filter((log) => criteria.actions!.includes(log.action));
    if (criteria.targetIds?.length) items = items.filter((log) => !!log.targetId && criteria.targetIds!.includes(log.targetId));
    else if (criteria.targetId) items = items.filter((log) => log.targetId === criteria.targetId);
    if (criteria.actor) items = items.filter((log) => log.actorId === criteria.actor || log.actorUsername === criteria.actor);
    if (criteria.from) items = items.filter((log) => log.at >= criteria.from!);
    if (criteria.to) items = items.filter((log) => log.at <= criteria.to!);
    items.sort((a, b) => b.at.getTime() - a.at.getTime());
    const page = criteria.page ?? 1;
    const pageSize = criteria.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
  }
}

function build(logs: AuditLog[] = []) {
  const declarations = new InMemoryDeclarationRepository([
    makeDeclaration({ id: 'ho-so-1', code: 'IMP-0001', enterprise: { taxCode: '5500123456', name: 'Cty A' } }),
    makeDeclaration({ id: 'ho-so-2', code: 'IMP-0002', enterprise: { taxCode: '5500123456', name: 'Cty A' } }),
  ]);
  const audit = new FakeAuditLogRepository(logs);
  const tickets = new InMemoryQueueTicketRepository(0);
  const yards = new InMemoryYardRepository();
  const scope = new DossierScopeService(new DataScopeService());
  return {
    audit,
    declarations,
    tickets,
    yards,
    useCase: new GetDispatchHistoryUseCase(audit, declarations, tickets, yards, scope),
  };
}

describe('Lịch sử điều phối (F33)', () => {
  it('chỉ trả các hành động điều phối, bỏ qua nhật ký kiểm toán khác', async () => {
    const { audit, useCase } = build([
      makeAuditLog({ id: 'a1', at: new Date('2026-07-20T08:00:00Z'), action: 'DISPATCH_ASSIGN', targetId: 'ho-so-1' }),
      makeAuditLog({ id: 'a2', at: new Date('2026-07-20T09:00:00Z'), action: 'AUTH_LOGIN', targetId: 'ho-so-1' }),
      makeAuditLog({ id: 'a3', at: new Date('2026-07-20T10:00:00Z'), action: 'DISPATCH_MOVE', targetId: 'ho-so-1' }),
      makeAuditLog({ id: 'a4', at: new Date('2026-07-20T11:00:00Z'), action: 'TIME_SLOT_UPDATE', targetId: 'ho-so-1' }),
    ]);

    const result = await useCase.execute({ access: dispatcher });

    // Repository nhận đúng bộ ba mã hành động điều phối để lọc.
    expect(audit.calls[0].actions).toEqual(['DISPATCH_ASSIGN', 'DISPATCH_MOVE', 'DISPATCH_RELEASE']);
    expect(result.items.map((entry) => entry.action)).toEqual(['DISPATCH_MOVE', 'DISPATCH_ASSIGN']);
  });

  it('dịch mã hồ sơ người dùng nhập sang id trước khi lọc và hiển thị lại mã hồ sơ', async () => {
    const { audit, useCase } = build([
      makeAuditLog({ id: 'a1', at: new Date('2026-07-20T08:00:00Z'), action: 'DISPATCH_ASSIGN', targetId: 'ho-so-2' }),
    ]);

    const result = await useCase.execute({ dossierCode: 'IMP-0002', access: dispatcher });

    expect(audit.calls[0].targetId).toBe('ho-so-2');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].dossierCode).toBe('IMP-0002');
  });

  it('mã hồ sơ không tồn tại thì trả trang rỗng và không truy vấn nhật ký', async () => {
    const { audit, useCase } = build([
      makeAuditLog({ id: 'a1', at: new Date('2026-07-20T08:00:00Z'), action: 'DISPATCH_ASSIGN', targetId: 'ho-so-1' }),
    ]);

    const result = await useCase.execute({ dossierCode: 'KHONG-CO', access: dispatcher });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(audit.calls).toHaveLength(0);
  });

  it('sắp xếp mới nhất trước', async () => {
    const { useCase } = build([
      makeAuditLog({ id: 'cu', at: new Date('2026-07-18T08:00:00Z'), action: 'DISPATCH_ASSIGN', targetId: 'ho-so-1' }),
      makeAuditLog({ id: 'moi', at: new Date('2026-07-22T08:00:00Z'), action: 'DISPATCH_RELEASE', targetId: 'ho-so-1' }),
      makeAuditLog({ id: 'giua', at: new Date('2026-07-20T08:00:00Z'), action: 'DISPATCH_MOVE', targetId: 'ho-so-1' }),
    ]);

    const result = await useCase.execute({ access: dispatcher });

    expect(result.items.map((entry) => entry.id)).toEqual(['moi', 'giua', 'cu']);
  });

  it('dựng đúng vị trí từ → đến, giữ null khi gán đầu và khi giải phóng', async () => {
    const { useCase } = build([
      makeAuditLog({
        id: 'assign',
        at: new Date('2026-07-20T08:00:00Z'),
        action: 'DISPATCH_ASSIGN',
        targetId: 'ho-so-1',
        before: null,
        after: { gate: 'B1', lane: 'B1-1', yard: null, slot: null },
      }),
      makeAuditLog({
        id: 'release',
        at: new Date('2026-07-20T09:00:00Z'),
        action: 'DISPATCH_RELEASE',
        targetId: 'ho-so-1',
        before: { gate: null, lane: null, yard: 'yard-a', slot: 'A01' },
        after: null,
      }),
    ]);

    const result = await useCase.execute({ access: dispatcher });

    const release = result.items.find((entry) => entry.id === 'release')!;
    const assign = result.items.find((entry) => entry.id === 'assign')!;
    expect(assign.from).toBeNull();
    expect(assign.to).toEqual({ gate: 'B1', lane: 'B1-1', yard: null, slot: null });
    expect(release.from).toEqual({ gate: null, lane: null, yard: 'yard-a', slot: 'A01' });
    expect(release.to).toBeNull();
  });

  it('kèm số thứ tự điều phối gần nhất của hồ sơ (BUG-084); rỗng khi hồ sơ chưa được cấp số', async () => {
    const { tickets, useCase } = build([
      makeAuditLog({ id: 'a1', at: new Date('2026-07-20T08:00:00Z'), action: 'DISPATCH_ASSIGN', targetId: 'ho-so-1' }),
      makeAuditLog({ id: 'a2', at: new Date('2026-07-20T09:00:00Z'), action: 'DISPATCH_MOVE', targetId: 'ho-so-2' }),
    ]);
    await tickets.insert(
      QueueTicket.issue({ dossierId: 'ho-so-1', flow: QueueFlow.ENTRY, checkpoint: 'B1', ticketNumber: 7, issuedById: 'u-1' }),
    );

    const result = await useCase.execute({ access: dispatcher });

    const one = result.items.find((entry) => entry.dossierId === 'ho-so-1')!;
    const two = result.items.find((entry) => entry.dossierId === 'ho-so-2')!;
    expect(one.ticketNumber).toBe(7);
    expect(one.ticketCode).toMatch(/\.0007$/);
    expect(two.ticketNumber).toBeNull();
    expect(two.ticketCode).toBeNull();
  });

  it('chặn tra lịch sử hồ sơ ngoài phạm vi khi lọc theo mã hồ sơ', async () => {
    const { useCase } = build([
      makeAuditLog({ id: 'a1', at: new Date('2026-07-20T08:00:00Z'), action: 'DISPATCH_ASSIGN', targetId: 'ho-so-1' }),
    ]);

    await expect(useCase.execute({ dossierCode: 'IMP-0001', access: otherEnterprise })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('hỗ trợ tìm kiếm theo chuỗi ký tự chứa (chuỗi con / partial match) trong mã hồ sơ', async () => {
    const { audit, useCase } = build([
      makeAuditLog({ id: 'a1', at: new Date('2026-07-20T08:00:00Z'), action: 'DISPATCH_ASSIGN', targetId: 'ho-so-1' }),
      makeAuditLog({ id: 'a2', at: new Date('2026-07-20T09:00:00Z'), action: 'DISPATCH_MOVE', targetId: 'ho-so-2' }),
    ]);

    // Nhập "00" (chuỗi con có trong cả IMP-0001 và IMP-0002)
    const result = await useCase.execute({ dossierCode: '00', access: dispatcher });

    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.dossierCode)).toEqual(['IMP-0002', 'IMP-0001']);
    expect(audit.calls[0].targetIds).toContain('ho-so-1');
    expect(audit.calls[0].targetIds).toContain('ho-so-2');
  });

  it('tìm kiếm theo chuỗi con chỉ trả về hồ sơ khớp chính xác chuỗi con đó', async () => {
    const { audit, useCase } = build([
      makeAuditLog({ id: 'a1', at: new Date('2026-07-20T08:00:00Z'), action: 'DISPATCH_ASSIGN', targetId: 'ho-so-1' }),
      makeAuditLog({ id: 'a2', at: new Date('2026-07-20T09:00:00Z'), action: 'DISPATCH_MOVE', targetId: 'ho-so-2' }),
    ]);

    // Nhập "0001" (chỉ có trong IMP-0001)
    const result = await useCase.execute({ dossierCode: '0001', access: dispatcher });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].dossierCode).toBe('IMP-0001');
    expect(audit.calls[0].targetIds).toContain('ho-so-1');
  });

  it('tìm kiếm theo chuỗi con vẫn áp dụng phạm vi dữ liệu (scope) của tài khoản', async () => {
    const { useCase } = build([
      makeAuditLog({ id: 'a1', at: new Date('2026-07-20T08:00:00Z'), action: 'DISPATCH_ASSIGN', targetId: 'ho-so-1' }),
      makeAuditLog({ id: 'a2', at: new Date('2026-07-20T09:00:00Z'), action: 'DISPATCH_MOVE', targetId: 'ho-so-2' }),
    ]);

    // otherEnterprise có MST 9999999999, cả ho-so-1 và ho-so-2 đều thuộc MST 5500123456
    const result = await useCase.execute({ dossierCode: '00', access: otherEnterprise });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('hỗ trợ tìm kiếm theo cả mã hồ sơ và biển số xe', async () => {
    const { declarations, useCase } = build([
      makeAuditLog({ id: 'a3', at: new Date('2026-07-20T08:00:00Z'), action: 'DISPATCH_ASSIGN', targetId: 'ho-so-3' }),
    ]);
    // ho-so-3 có mã IMP-20260820-000003 (không chứa '29C'), biển số là '29C-123.45'
    await declarations.save(
      makeDeclaration({
        id: 'ho-so-3',
        code: 'IMP-20260820-000003',
        vehicle: { plateNumber: '29C-123.45' },
      }),
    );

    // Tìm '29C' trong ô tìm kiếm -> phải khớp ho-so-3 theo biển số xe
    const result = await useCase.execute({ dossierCode: '29C', access: dispatcher });

    expect(result.items.some((i) => i.dossierCode === 'IMP-20260820-000003')).toBe(true);
  });
});


