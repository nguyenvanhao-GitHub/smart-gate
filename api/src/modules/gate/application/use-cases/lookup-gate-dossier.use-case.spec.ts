import { BorderGateConfig, GateDirection } from '../../../catalog/domain/border-facility.catalog';
import { DeclarationStatus } from '../../../declarations/domain/declaration.enums';
import { makeAccess, makeDeclaration } from '../../../declarations/testing/declaration.fixture';
import { InMemoryDeclarationRepository } from '../../../declarations/testing/declaration.fixture';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { GateDecision, GateEvent } from '../../domain/gate-event.entity';
import { GateEvaluationService } from '../services/gate-evaluation.service';
import { LookupGateDossierUseCase } from './lookup-gate-dossier.use-case';
import { GateEventRepository } from '../ports/gate-event.repository';

class InMemoryGateEventRepo implements Partial<GateEventRepository> {
  rows: GateEvent[] = [];

  async append(event: GateEvent): Promise<GateEvent> {
    this.rows.push(event);
    return event;
  }

  async findLatestByDossier(dossierId: string): Promise<GateEvent | null> {
    const list = this.rows.filter((item) => item.dossierId === dossierId);
    return list.length ? list[list.length - 1] : null;
  }

  async findAllowedDirections(dossierId: string): Promise<GateDirection[]> {
    return this.rows
      .filter((item) => item.dossierId === dossierId && item.decision === GateDecision.ALLOW)
      .map((item) => item.direction);
  }
}

describe('LookupGateDossierUseCase', () => {
  const officer = makeAccess({
    userId: 'officer-1',
    roles: [{ code: 'BIEN_PHONG', name: 'Biên phòng', dataScope: 4 as any }],
    permissions: ['gate.view', 'gate.confirm'],
  });

  const gateA1: BorderGateConfig = {
    code: 'A1',
    name: 'Cửa A1 - Nhập cảnh',
    direction: GateDirection.ENTRY,
    checkpoint: 'A1',
    active: true,
  };

  const gateB1: BorderGateConfig = {
    code: 'B1',
    name: 'Cửa B1 - Xuất cảnh',
    direction: GateDirection.EXIT,
    checkpoint: 'B1',
    active: true,
  };

  function setup(declarationsList: any[] = [], initialEvents: GateEvent[] = []) {
    const declRepo = new InMemoryDeclarationRepository(declarationsList);
    const eventRepo = new InMemoryGateEventRepo();
    eventRepo.rows = [...initialEvents];
    const scope = new DossierScopeService(new DataScopeService());

    const evaluator = {
      resolveGate: jest.fn().mockImplementation(async (gateCode?: string, direction?: GateDirection) => {
        if (gateCode === 'B1' || direction === GateDirection.EXIT) return gateB1;
        if (gateCode === 'A1' || direction === GateDirection.ENTRY) return gateA1;
        if (gateCode === 'A1') return gateA1;
        if (gateCode === 'B1') return gateB1;
        return gateA1;
      }),
      evaluate: jest.fn().mockResolvedValue({
        gate: gateA1,
        checklist: [],
        evaluation: {
          canOpen: true,
          statusColor: 'GREEN',
          blockingReasons: [],
          requiredCompletedSteps: [],
        },
      }),
    } as unknown as GateEvaluationService;

    const useCase = new LookupGateDossierUseCase(
      declRepo,
      eventRepo as unknown as GateEventRepository,
      scope,
      evaluator,
    );

    return { useCase, declRepo, eventRepo, evaluator };
  }

  describe('Tại Cổng vào (ENTRY)', () => {
    it('tra cứu thành công hồ sơ ở trạng thái Đã gửi (SUBMITTED) và chưa qua cổng vào', async () => {
      const decl = makeDeclaration({
        id: 'hs-1',
        code: 'EXP-001',
        status: DeclarationStatus.WAITING_GATE,
      });
      const { useCase } = setup([decl]);

      const result = await useCase.execute({
        code: 'EXP-001',
        gateCode: 'A1',
        access: officer,
      });

      expect(result.dossier.code).toBe('EXP-001');
      expect(result.gate.direction).toBe(GateDirection.ENTRY);
    });

    it('chặn tra cứu hồ sơ đã qua cổng vào (đã có sự kiện ENTRY ALLOW)', async () => {
      const decl = makeDeclaration({
        id: 'hs-1',
        code: 'EXP-001',
        status: DeclarationStatus.PROCESSING,
      });
      const enteredEvent = GateEvent.record({
        dossierId: 'hs-1',
        gateCode: 'A1',
        direction: GateDirection.ENTRY,
        decision: GateDecision.ALLOW,
        canOpen: true,
        statusColor: 'GREEN',
        blockingReasons: [],
        checklist: [],
        note: null,
        actorId: 'officer-1',
        actorName: null,
      });
      const { useCase } = setup([decl], [enteredEvent]);

      await expect(
        useCase.execute({
          code: 'EXP-001',
          gateCode: 'A1',
          access: officer,
        }),
      ).rejects.toThrow();
    });

    it('chặn tra cứu hồ sơ đã hoàn thành / rời cửa khẩu tại cổng vào', async () => {
      const decl = makeDeclaration({
        id: 'hs-completed',
        code: 'EXP-COMPLETED',
        status: DeclarationStatus.COMPLETED,
      });
      const { useCase } = setup([decl]);

      await expect(
        useCase.execute({
          code: 'EXP-COMPLETED',
          gateCode: 'A1',
          access: officer,
        }),
      ).rejects.toThrow();
    });
  });

  describe('Tại Cổng ra (EXIT)', () => {
    it('chặn tra cứu hồ sơ chưa được duyệt vào cổng', async () => {
      const decl = makeDeclaration({
        id: 'hs-1',
        code: 'EXP-001',
        status: DeclarationStatus.SUBMITTED,
      });
      const { useCase } = setup([decl]);

      await expect(
        useCase.execute({
          code: 'EXP-001',
          gateCode: 'B1',
          access: officer,
        }),
      ).rejects.toThrow();
    });

    it('tra cứu thành công hồ sơ đã được duyệt vào cổng và chưa ra cổng', async () => {
      const decl = makeDeclaration({
        id: 'hs-1',
        code: 'EXP-001',
        status: DeclarationStatus.PROCESSING,
      });
      const enteredEvent = GateEvent.record({
        dossierId: 'hs-1',
        gateCode: 'A1',
        direction: GateDirection.ENTRY,
        decision: GateDecision.ALLOW,
        canOpen: true,
        statusColor: 'GREEN',
        blockingReasons: [],
        checklist: [],
        note: null,
        actorId: 'officer-1',
        actorName: null,
      });
      const { useCase } = setup([decl], [enteredEvent]);

      const result = await useCase.execute({
        code: 'EXP-001',
        gateCode: 'B1',
        access: officer,
      });

      expect(result.dossier.code).toBe('EXP-001');
    });

    it('chặn tra cứu hồ sơ đã hoàn thành / đã qua cổng ra', async () => {
      const decl = makeDeclaration({
        id: 'hs-completed',
        code: 'EXP-COMPLETED',
        status: DeclarationStatus.COMPLETED,
      });
      const enteredEvent = GateEvent.record({
        dossierId: 'hs-completed',
        gateCode: 'A1',
        direction: GateDirection.ENTRY,
        decision: GateDecision.ALLOW,
        canOpen: true,
        statusColor: 'GREEN',
        blockingReasons: [],
        checklist: [],
        note: null,
        actorId: 'officer-1',
        actorName: null,
      });
      const exitedEvent = GateEvent.record({
        dossierId: 'hs-completed',
        gateCode: 'B1',
        direction: GateDirection.EXIT,
        decision: GateDecision.ALLOW,
        canOpen: true,
        statusColor: 'GREEN',
        blockingReasons: [],
        checklist: [],
        note: null,
        actorId: 'officer-1',
        actorName: null,
      });
      const { useCase } = setup([decl], [enteredEvent, exitedEvent]);

      await expect(
        useCase.execute({
          code: 'EXP-COMPLETED',
          gateCode: 'B1',
          access: officer,
        }),
      ).rejects.toThrow();
    });
  });
  it('tra cứu bằng direction ENTRY khi không có gateCode', async () => {
    const dec = makeDeclaration({ code: 'IMP-DIR-01', status: DeclarationStatus.WAITING_GATE });
    const { useCase, evaluator } = setup([dec]);

    const res = await useCase.execute({
      code: 'IMP-DIR-01',
      direction: GateDirection.ENTRY,
      access: officer,
    });

    expect(evaluator.resolveGate).toHaveBeenCalledWith(undefined, GateDirection.ENTRY);
    expect(res.dossier.code).toBe('IMP-DIR-01');
    expect(res.gate.direction).toBe(GateDirection.ENTRY);
  });

  it('tra cứu bằng direction EXIT khi không có gateCode', async () => {
    const dec = makeDeclaration({ code: 'IMP-DIR-02', status: DeclarationStatus.WAITING_GATE });
    const enteredEvent = { id: 'evt-1', dossierId: dec.id, direction: GateDirection.ENTRY, decision: GateDecision.ALLOW } as any;
    const { useCase, evaluator } = setup([dec], [enteredEvent]);

    const res = await useCase.execute({
      code: 'IMP-DIR-02',
      direction: GateDirection.EXIT,
      access: officer,
    });

    expect(evaluator.resolveGate).toHaveBeenCalledWith(undefined, GateDirection.EXIT);
    expect(res.dossier.code).toBe('IMP-DIR-02');
    expect(res.gate.direction).toBe(GateDirection.EXIT);
  });

});
