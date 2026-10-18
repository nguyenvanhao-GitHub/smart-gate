import { DataSource, Repository } from 'typeorm';
import { DeclarationStatus } from '../../domain/declaration.enums';
import { DeclarationOrmEntity } from './declaration.orm-entity';
import { TypeOrmDeclarationRepository } from './typeorm-declaration.repository';

describe('TypeOrmDeclarationRepository — applyScope and excludeDraft (SG-284)', () => {
  let andWhereCalls: Array<{ clause: string; params?: Record<string, unknown> }>;

  function buildRepository(): TypeOrmDeclarationRepository {
    andWhereCalls = [];
    const query: Record<string, jest.Mock> = {
      leftJoin: jest.fn(() => query),
      orderBy: jest.fn(() => query),
      skip: jest.fn(() => query),
      take: jest.fn(() => query),
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
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    const ormRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
      manager: {},
    } as unknown as Repository<DeclarationOrmEntity>;

    const dataSource = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
    } as unknown as DataSource;

    return new TypeOrmDeclarationRepository(ormRepository, dataSource);
  }

  it('áp dụng excludeDraft = true khi truy vấn cho Điều phối viên (unrestricted + excludeDraft)', async () => {
    const repository = buildRepository();

    await repository.findPage({
      page: 1,
      pageSize: 10,
      scope: {
        unrestricted: true,
        excludeDraft: true,
      },
    });

    const draftCondition = andWhereCalls.find((c) => c.clause.includes('declaration.status != :scopeDraftStatus'));
    expect(draftCondition).toBeDefined();
    expect(draftCondition?.params).toEqual({ scopeDraftStatus: DeclarationStatus.DRAFT });
  });

  it('áp dụng CẢ excludeDraft VÀ reachedStepCodes cho lực lượng liên ngành (Biên phòng / Hải quan / Kiểm dịch / Thu phí)', async () => {
    const repository = buildRepository();

    await repository.findPage({
      page: 1,
      pageSize: 10,
      scope: {
        unrestricted: true,
        reachedStepCodes: ['EXPORT_CUSTOMS', 'IMPORT_CUSTOMS'],
        excludeDraft: true,
      },
    });

    const draftCondition = andWhereCalls.find((c) => c.clause.includes('declaration.status != :scopeDraftStatus'));
    expect(draftCondition).toBeDefined();
    expect(draftCondition?.params).toEqual({ scopeDraftStatus: DeclarationStatus.DRAFT });

    const workflowCondition = andWhereCalls.find((c) => c.clause.includes('workflow_instance_steps'));
    expect(workflowCondition).toBeDefined();
    expect(workflowCondition?.params).toEqual({
      reachedStepCodes: ['EXPORT_CUSTOMS', 'IMPORT_CUSTOMS'],
      reachedDoneStatuses: ['COMPLETED', 'REJECTED'],
    });
  });

  it('áp dụng requireWorkflow = true cho Điều phối viên (unrestricted + excludeDraft + requireWorkflow)', async () => {
    const repository = buildRepository();

    await repository.findPage({
      page: 1,
      pageSize: 10,
      scope: {
        unrestricted: true,
        excludeDraft: true,
        requireWorkflow: true,
      },
    });

    const draftCondition = andWhereCalls.find((c) => c.clause.includes('declaration.status != :scopeDraftStatus'));
    expect(draftCondition).toBeDefined();
    expect(draftCondition?.params).toEqual({ scopeDraftStatus: DeclarationStatus.DRAFT });

    const workflowCondition = andWhereCalls.find((c) => c.clause.includes('workflow_instances'));
    expect(workflowCondition).toBeDefined();
  });

  it('SYS_ADMIN (unrestricted = true, excludeDraft = false/undefined) KHÔNG bị chèn điều kiện lọc bản nháp hay bước', async () => {
    const repository = buildRepository();

    await repository.findPage({
      page: 1,
      pageSize: 10,
      scope: {
        unrestricted: true,
      },
    });

    const draftCondition = andWhereCalls.find((c) => c.clause.includes('declaration.status != :scopeDraftStatus'));
    expect(draftCondition).toBeUndefined();

    const workflowCondition = andWhereCalls.find((c) => c.clause.includes('workflow_instance_steps'));
    expect(workflowCondition).toBeUndefined();
  });
});
