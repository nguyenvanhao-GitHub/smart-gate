import { Repository } from 'typeorm';
import { UserStatus } from '../../domain/user.entity';
import { TypeOrmUserRepository } from './typeorm-user.repository';
import { UserOrmEntity } from './user.orm-entity';

describe('TypeOrmUserRepository — findMany sorting & filtering (SG-289)', () => {
  let orderByCalls: Array<{ sort: string; order?: 'ASC' | 'DESC' }>;
  let addOrderByCalls: Array<{ sort: string; order?: 'ASC' | 'DESC' }>;
  let andWhereCalls: Array<{ clause: string; params?: Record<string, unknown> }>;
  let skipVal: number | undefined;
  let takeVal: number | undefined;

  function buildRepository(mockRows: Partial<UserOrmEntity>[] = [], mockTotal = 0): TypeOrmUserRepository {
    orderByCalls = [];
    addOrderByCalls = [];
    andWhereCalls = [];
    skipVal = undefined;
    takeVal = undefined;

    const query: Record<string, jest.Mock> = {
      orderBy: jest.fn((sort: string, order?: 'ASC' | 'DESC') => {
        orderByCalls.push({ sort, order });
        return query;
      }),
      addOrderBy: jest.fn((sort: string, order?: 'ASC' | 'DESC') => {
        addOrderByCalls.push({ sort, order });
        return query;
      }),
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
      skip: jest.fn((val: number) => {
        skipVal = val;
        return query;
      }),
      take: jest.fn((val: number) => {
        takeVal = val;
        return query;
      }),
      getManyAndCount: jest.fn().mockResolvedValue([mockRows, mockTotal]),
    };

    const ormRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
    } as unknown as Repository<UserOrmEntity>;

    return new TypeOrmUserRepository(ormRepository);
  }

  it('SG-289: sắp xếp ưu tiên PENDING lên đầu (CASE WHEN status=PENDING THEN 0 ELSE 1 END ASC)', async () => {
    const repository = buildRepository();

    await repository.findMany({});

    expect(orderByCalls).toHaveLength(1);
    expect(orderByCalls[0].sort).toBe(`CASE WHEN user.status = '${UserStatus.PENDING}' THEN 0 ELSE 1 END`);
    expect(orderByCalls[0].order).toBe('ASC');
  });

  it('SG-289: trong từng nhóm sắp xếp theo createdAt DESC và tie-breaker id DESC', async () => {
    const repository = buildRepository();

    await repository.findMany({});

    expect(addOrderByCalls).toHaveLength(2);
    expect(addOrderByCalls[0].sort).toBe('user.createdAt');
    expect(addOrderByCalls[0].order).toBe('DESC');
    expect(addOrderByCalls[1].sort).toBe('user.id');
    expect(addOrderByCalls[1].order).toBe('DESC');
  });

  it('lọc theo roleCode qua subquery EXISTS trong user_roles', async () => {
    const repository = buildRepository();

    await repository.findMany({ roleCode: 'DECLARANT' });

    const roleCall = andWhereCalls.find((call) => call.clause.includes('user_roles'));
    expect(roleCall).toBeDefined();
    expect(roleCall?.params).toEqual({ roleCode: 'DECLARANT' });
  });

  it('lọc theo status', async () => {
    const repository = buildRepository();

    await repository.findMany({ status: UserStatus.PENDING });

    const statusCall = andWhereCalls.find((call) => call.clause.includes('user.status = :status'));
    expect(statusCall).toBeDefined();
    expect(statusCall?.params).toEqual({ status: UserStatus.PENDING });
  });

  it('lọc theo organizationId', async () => {
    const repository = buildRepository();

    await repository.findMany({ organizationId: 'org-uuid-1' });

    const orgCall = andWhereCalls.find((call) => call.clause.includes('user.organizationId = :organizationId'));
    expect(orgCall).toBeDefined();
    expect(orgCall?.params).toEqual({ organizationId: 'org-uuid-1' });
  });

  it('lọc theo keyword tìm kiếm trong username, displayName, title, email, phone', async () => {
    const repository = buildRepository();

    await repository.findMany({ keyword: '  test_user  ' });

    const keywordCall = andWhereCalls.find((call) => call.clause.includes('user.username ILIKE :keyword'));
    expect(keywordCall).toBeDefined();
    expect(keywordCall?.params).toEqual({ keyword: '%test_user%' });
  });

  it('phân trang đúng theo page và pageSize', async () => {
    const repository = buildRepository();

    await repository.findMany({ page: 3, pageSize: 15 });

    expect(skipVal).toBe(30);
    expect(takeVal).toBe(15);
  });
});
