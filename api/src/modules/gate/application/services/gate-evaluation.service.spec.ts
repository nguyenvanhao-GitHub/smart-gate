import { GateDirection } from '../../../catalog/domain/border-facility.catalog';
import { GateEvaluationService } from './gate-evaluation.service';

describe('GateEvaluationService - resolveGate', () => {
  let service: GateEvaluationService;
  let facilities: { listGates: jest.Mock };

  beforeEach(() => {
    facilities = { listGates: jest.fn().mockResolvedValue([]) };
    const workflow = {} as any;
    const checklistCatalog = { listDefinitions: jest.fn().mockResolvedValue([]) } as any;
    const events = { findLatestByDossier: jest.fn().mockResolvedValue(null) } as any;
    const settlements = { snapshotOf: jest.fn().mockResolvedValue(null) } as any;

    service = new GateEvaluationService(workflow, facilities as any, checklistCatalog, events, settlements);
  });

  it('trả về cổng tổng hợp GATE_ENTRY khi catalog rỗng và tra cứu direction ENTRY', async () => {
    facilities.listGates.mockResolvedValue([]);
    const gate = await service.resolveGate(undefined, GateDirection.ENTRY);
    expect(gate).toEqual({
      code: 'GATE_ENTRY',
      name: 'Cổng vào',
      direction: GateDirection.ENTRY,
      checkpoint: 'SMART_GATE',
      active: true,
    });
  });

  it('trả về cổng tổng hợp GATE_EXIT khi catalog rỗng và tra cứu direction EXIT', async () => {
    facilities.listGates.mockResolvedValue([]);
    const gate = await service.resolveGate(undefined, GateDirection.EXIT);
    expect(gate).toEqual({
      code: 'GATE_EXIT',
      name: 'Cổng ra',
      direction: GateDirection.EXIT,
      checkpoint: 'SMART_GATE',
      active: true,
    });
  });

  it('trả về cổng tổng hợp khi truyền mã tổng hợp GATE_ENTRY', async () => {
    facilities.listGates.mockResolvedValue([]);
    const gate = await service.resolveGate('GATE_ENTRY');
    expect(gate.direction).toBe(GateDirection.ENTRY);
    expect(gate.code).toBe('GATE_ENTRY');
  });

  it('ném lỗi gate.notFound khi truyền gateCode vật lý không tồn tại', async () => {
    facilities.listGates.mockResolvedValue([
      { code: 'A1', name: 'Cửa A1', direction: GateDirection.ENTRY, active: true },
    ]);
    await expect(service.resolveGate('UNKNOWN')).rejects.toThrow();
  });

  it('ném lỗi gate.inactive khi truyền gateCode vật lý bị khóa (active = false)', async () => {
    facilities.listGates.mockResolvedValue([
      { code: 'A1', name: 'Cửa A1', direction: GateDirection.ENTRY, active: false },
    ]);
    await expect(service.resolveGate('A1')).rejects.toThrow();
  });

  it('trả về đúng cổng vật lý khi truyền gateCode hợp lệ và active', async () => {
    const gateA1 = { code: 'A1', name: 'Cửa A1', direction: GateDirection.ENTRY, checkpoint: 'A1', active: true };
    facilities.listGates.mockResolvedValue([gateA1]);
    const result = await service.resolveGate('A1');
    expect(result).toBe(gateA1);
  });

  it('ưu tiên trả về cổng từ catalog nếu có cổng active khớp direction', async () => {
    const gateA2 = { code: 'A2', name: 'Cửa A2', direction: GateDirection.ENTRY, checkpoint: 'A2', active: true };
    facilities.listGates.mockResolvedValue([gateA2]);
    const result = await service.resolveGate(undefined, GateDirection.ENTRY);
    expect(result).toBe(gateA2);
  });
});
