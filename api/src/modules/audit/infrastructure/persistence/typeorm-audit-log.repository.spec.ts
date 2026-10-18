import { Repository } from 'typeorm';
import { AUDIT_KNOWN_TARGET_TYPES, AUDIT_MODULE_TARGET_TYPES } from '../../domain/audit-module';
import { AuditLogOrmEntity } from './audit-log.orm-entity';
import { TypeOrmAuditLogRepository } from './typeorm-audit-log.repository';

/** Ghi lại tham số của mọi lần `andWhere` để kiểm điều kiện đã áp — dùng chung cho các nhóm test dưới. */
let andWhereCalls: Array<{ clause: string; params?: Record<string, unknown> }>;

function buildRepository(): TypeOrmAuditLogRepository {
  andWhereCalls = [];
  const query: Record<string, jest.Mock> = {
    orderBy: jest.fn(() => query),
    andWhere: jest.fn((clause: any, params?: Record<string, unknown>) => {
      if (typeof clause === 'string') {
        andWhereCalls.push({ clause, params });
      } else if (clause && typeof clause.whereFactory === 'function') {
        const subCalls: string[] = [];
        const subParams: Record<string, unknown> = {};
        const qb: { where: jest.Mock; orWhere: jest.Mock } = {
          where: jest.fn((subClause: string, p?: Record<string, unknown>) => {
            subCalls.push(subClause);
            if (p) Object.assign(subParams, p);
            return qb;
          }),
          orWhere: jest.fn((subClause: string, p?: Record<string, unknown>) => {
            subCalls.push(subClause);
            if (p) Object.assign(subParams, p);
            return qb;
          }),
        };
        clause.whereFactory(qb);
        andWhereCalls.push({ clause: subCalls.join(' OR '), params: subParams });
      }
      return query;
    }),
    skip: jest.fn(() => query),
    take: jest.fn(() => query),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  const ormRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(query),
  } as unknown as Repository<AuditLogOrmEntity>;
  return new TypeOrmAuditLogRepository(ormRepository);
}

function paramOf(clauseFragment: string): Record<string, unknown> | undefined {
  return andWhereCalls.find((call) => call.clause.includes(clauseFragment))?.params;
}

/**
 * BUG-025 — biên khoảng ngày của bộ lọc nhật ký phải bao trùm **cả hai đầu mút theo ngày dương lịch
 * giờ VN**. Trước đây `to` được so ở mốc 00:00 nên loại trọn ngày kết thúc; đây khóa lại: `from` là
 * đầu ngày VN, `to` là cuối ngày VN (23:59:59.999), quy về UTC.
 */
describe('TypeOrmAuditLogRepository — biên khoảng ngày (BUG-025)', () => {
  it('so `to` tới CUỐI ngày VN (16:59:59.999 UTC), không phải đầu ngày', async () => {
    const repository = buildRepository();

    await repository.findMany({ to: new Date('2026-08-02T09:00:00.000Z') });

    const to = paramOf('log.at <= :to')?.['to'] as Date;
    expect(to.toISOString()).toBe('2026-08-02T16:59:59.999Z');
  });

  it('so `from` từ ĐẦU ngày VN (17:00 UTC hôm trước)', async () => {
    const repository = buildRepository();

    await repository.findMany({ from: new Date('2026-08-02T09:00:00.000Z') });

    const from = paramOf('log.at >= :from')?.['from'] as Date;
    expect(from.toISOString()).toBe('2026-08-01T17:00:00.000Z');
  });

  it('bản ghi lúc trưa ngày 02/08 nằm TRONG khoảng [from(02/08), to(02/08)]', async () => {
    const repository = buildRepository();
    const day = new Date('2026-08-02T00:00:00.000Z');
    const record = new Date('2026-08-02T05:00:00.000Z'); // 12:00 giờ VN ngày 02/08

    await repository.findMany({ from: day, to: day });

    const from = paramOf('log.at >= :from')?.['from'] as Date;
    const to = paramOf('log.at <= :to')?.['to'] as Date;
    expect(from.getTime()).toBeLessThanOrEqual(record.getTime());
    expect(to.getTime()).toBeGreaterThanOrEqual(record.getTime());
  });
});

/**
 * BUG-051 — lọc phân hệ chạy ở **tầng máy chủ** để thẻ thống kê và phân trang khớp đúng tập đã lọc.
 * Nhật ký không có cột phân hệ nên điều kiện SQL phải mô phỏng đúng `auditModuleOf`: tiền tố `action`
 * (`FEE_`/`AUTH_`) xét trước, còn lại theo `targetType`; loại lạ rơi về `OTHER`.
 */
describe('TypeOrmAuditLogRepository — lọc phân hệ server-side (BUG-051)', () => {
  /** Câu điều kiện chứa tham số `moduleTargets` (điều kiện phân hệ duy nhất). */
  function moduleClause(): { clause: string; params?: Record<string, unknown> } | undefined {
    return andWhereCalls.find((call) => call.clause.includes(':...moduleTargets'));
  }

  it('không truyền phân hệ thì KHÔNG thêm điều kiện phân hệ nào', async () => {
    const repository = buildRepository();
    await repository.findMany({});
    expect(moduleClause()).toBeUndefined();
  });

  it('DOSSIER lọc theo đúng tập targetType, sau khi loại tiền tố FEE_/AUTH_', async () => {
    const repository = buildRepository();
    await repository.findMany({ module: 'DOSSIER' });

    const applied = moduleClause();
    expect(applied?.params?.['moduleTargets']).toEqual(AUDIT_MODULE_TARGET_TYPES.DOSSIER);
    expect(applied?.clause).toContain('log.targetType IN (:...moduleTargets)');
    expect(applied?.clause).toContain("NOT (LEFT(log.action, 4) = 'FEE_')");
    expect(applied?.clause).toContain("NOT (LEFT(log.action, 5) = 'AUTH_')");
  });

  it('FEE khớp cả tiền tố action FEE_ lẫn targetType FEE_RULE', async () => {
    const repository = buildRepository();
    await repository.findMany({ module: 'FEE' });

    const applied = moduleClause();
    expect(applied?.params?.['moduleTargets']).toEqual(AUDIT_MODULE_TARGET_TYPES.FEE);
    expect(applied?.clause).toContain("LEFT(log.action, 4) = 'FEE_'");
  });

  it('SYSTEM khớp tiền tố AUTH_ hoặc targetType USER/ROLE', async () => {
    const repository = buildRepository();
    await repository.findMany({ module: 'SYSTEM' });

    const applied = moduleClause();
    expect(applied?.params?.['moduleTargets']).toEqual(AUDIT_MODULE_TARGET_TYPES.SYSTEM);
    expect(applied?.clause).toContain("LEFT(log.action, 5) = 'AUTH_'");
  });

  it('OTHER là phần bù: loại lạ, không thuộc tập đã biết và không có tiền tố', async () => {
    const repository = buildRepository();
    await repository.findMany({ module: 'OTHER' });

    const applied = moduleClause();
    expect(applied?.params?.['moduleTargets']).toEqual(AUDIT_KNOWN_TARGET_TYPES);
    expect(applied?.clause).toContain('log.targetType NOT IN (:...moduleTargets)');
  });
});

describe('TypeOrmAuditLogRepository — lọc theo hành động (action / actions)', () => {
  it('lọc action theo partial match ILIKE :action (%keyword%)', async () => {
    const repository = buildRepository();
    await repository.findMany({ action: 'DELETE' });

    const actionCall = andWhereCalls.find((call) => call.clause.includes('log.action ILIKE :action'));
    expect(actionCall).toBeDefined();
    expect(actionCall?.params?.['action']).toBe('%DELETE%');
  });

  it('lọc actions theo danh sách IN (:...actions)', async () => {
    const repository = buildRepository();
    await repository.findMany({ actions: ['DECLARATION_DELETE', 'USER_DELETE'] });

    const actionsCall = andWhereCalls.find((call) => call.clause.includes('log.action IN (:...actions)'));
    expect(actionsCall).toBeDefined();
    expect(actionsCall?.params?.['actions']).toEqual(['DECLARATION_DELETE', 'USER_DELETE']);
  });
});

describe('TypeOrmAuditLogRepository — lọc theo cán bộ (SG-249: actor username / displayName / role)', () => {
  it('lọc actor bao trùm cả actorUsername, actorRole, users.displayName và roles.name', async () => {
    const repository = buildRepository();
    await repository.findMany({ actor: 'Điều phối viên' });

    const actorCall = andWhereCalls.find((call) => call.clause.includes('log.actor_username ILIKE :actor'));
    expect(actorCall).toBeDefined();
    expect(actorCall?.params?.['actor']).toBe('%Điều phối viên%');
    expect(actorCall?.clause).toContain('log.actor_role ILIKE :actor');
    expect(actorCall?.clause).toContain('users');
    expect(actorCall?.clause).toContain('roles');
  });
});

