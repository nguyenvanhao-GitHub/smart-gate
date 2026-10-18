import { YardZoneConfig, buildSlotCodes } from '../../catalog/domain/border-facility.catalog';
import { BorderFacilityService } from '../../catalog/application/services/border-facility.service';
import { GateDirection } from '../../catalog/domain/border-facility.catalog';
import {
  DispatchAssignmentConflictError,
  DispatchAssignmentRepository,
  DispatchAssignmentWithDossier,
  DispatchBoardCriteria,
  DispatchBoardRow,
} from '../application/ports/dispatch-assignment.repository';
import { YardRepository } from '../application/ports/yard.repository';
import { DispatchAssignment, DispatchAssignmentStatus } from '../domain/dispatch-assignment.entity';
import { ParkingSlot, Yard } from '../domain/yard.entity';

/**
 * Kho vị trí điều phối trong bộ nhớ — KHÔNG dùng trong mã sản phẩm.
 *
 * Bắt chước đúng **hai chỉ mục duy nhất có điều kiện** của PostgreSQL: chỉ kiểm khi ghi, và chỉ
 * áp cho các dòng `ACTIVE`. Cờ `blindPreChecks` cho phép giả lập tình huống hai yêu cầu chạy song
 * song — lúc đó `findActive*` chưa thấy nhau, chỉ ràng buộc ở tầng dữ liệu mới chặn được.
 */
export class InMemoryDispatchAssignmentRepository implements DispatchAssignmentRepository {
  readonly rows: DispatchAssignment[] = [];

  constructor(private readonly blindPreChecks = false) {}

  async insert(assignment: DispatchAssignment): Promise<DispatchAssignment> {
    this.assertUnique(assignment);
    this.rows.push(assignment);
    return assignment;
  }

  async update(assignment: DispatchAssignment): Promise<DispatchAssignment> {
    this.assertUnique(assignment);
    const index = this.rows.findIndex((row) => row.id === assignment.id);
    if (index >= 0) this.rows[index] = assignment;
    else this.rows.push(assignment);
    return assignment;
  }

  async findById(id: string): Promise<DispatchAssignment | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async findActiveByDossier(dossierId: string): Promise<DispatchAssignment | null> {
    if (this.blindPreChecks) return null;
    return this.rows.find((row) => row.dossierId === dossierId && row.isActive) ?? null;
  }

  async findActiveBySlot(yardId: string, slotCode: string): Promise<DispatchAssignment | null> {
    if (this.blindPreChecks) return null;
    return this.rows.find((row) => row.isActive && row.yardId === yardId && row.slotCode === slotCode) ?? null;
  }

  async findActiveByYard(yardId: string): Promise<DispatchAssignmentWithDossier[]> {
    return this.rows
      .filter((row) => row.isActive && row.yardId === yardId && !!row.slotCode)
      .map((assignment) => ({ assignment, dossierCode: assignment.dossierId, plateNumber: '', enterpriseName: '' }));
  }

  async countOccupiedByYard(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    this.rows
      .filter((row) => row.isActive && row.yardId && row.slotCode)
      .forEach((row) => counts.set(row.yardId as string, (counts.get(row.yardId as string) ?? 0) + 1));
    return counts;
  }

  async countOverdueByYard(overdueBefore: Date): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    this.rows
      .filter((row) => row.isActive && row.yardId && row.slotCode && row.assignedAt < overdueBefore)
      .forEach((row) => counts.set(row.yardId as string, (counts.get(row.yardId as string) ?? 0) + 1));
    return counts;
  }

  async findBoard(_criteria: DispatchBoardCriteria): Promise<DispatchBoardRow[]> {
    return [];
  }

  /** Đúng hai chỉ mục duy nhất trong migration P4, không hơn không kém. */
  private assertUnique(candidate: DispatchAssignment): void {
    if (candidate.status !== DispatchAssignmentStatus.ACTIVE) return;
    const others = this.rows.filter((row) => row.id !== candidate.id && row.isActive);

    if (others.some((row) => row.dossierId === candidate.dossierId)) {
      throw new DispatchAssignmentConflictError('DOSSIER');
    }
    if (
      candidate.yardId &&
      candidate.slotCode &&
      others.some((row) => row.yardId === candidate.yardId && row.slotCode === candidate.slotCode)
    ) {
      throw new DispatchAssignmentConflictError('SLOT');
    }
  }
}

/** Kho khu bãi trong bộ nhớ — KHÔNG dùng trong mã sản phẩm. */
export class InMemoryYardRepository implements YardRepository {
  readonly rows: Yard[] = [];

  constructor(zones: YardZoneConfig[] = []) {
    zones.forEach((zone) => {
      const yard = Yard.create(zone.code, zone.name, zone.capacity);
      yard.slots = buildSlotCodes(zone).map((code, index) => ParkingSlot.create(yard.id, code, index + 1));
      this.rows.push(yard);
    });
  }

  async listYards(): Promise<Yard[]> {
    return this.rows;
  }

  async findYardById(id: string): Promise<Yard | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async findYardByCode(code: string): Promise<Yard | null> {
    return this.rows.find((row) => row.code === code) ?? null;
  }

  async ensureLayout(zones: YardZoneConfig[] = []): Promise<void> {
    zones.forEach((zone) => {
      let yard = this.rows.find((r) => r.code === zone.code);
      if (!yard) {
        yard = Yard.create(zone.code, zone.name, zone.capacity);
        this.rows.push(yard);
      }
      yard.name = zone.name;
      yard.capacity = zone.capacity;
      yard.isActive = zone.active;

      const targetCodes = new Set(buildSlotCodes(zone));
      const currentCodes = new Set(yard.slots.map((s) => s.code));

      buildSlotCodes(zone).forEach((code, index) => {
        if (!currentCodes.has(code)) {
          yard.slots.push(ParkingSlot.create(yard.id, code, index + 1));
        }
      });

      yard.slots = yard.slots.filter((slot) => targetCodes.has(slot.code));
    });
  }

  async setSlotActive(yardId: string, slotCode: string, isActive: boolean): Promise<number> {
    let affected = 0;
    this.rows
      .filter((yard) => yard.id === yardId)
      .forEach((yard) =>
        yard.slots
          .filter((slot) => slot.code === slotCode)
          .forEach((slot) => {
            slot.isActive = isActive;
            affected += 1;
          }),
      );
    return affected;
  }
}

/** Cấu hình khu bãi mẫu: 1 khu, 4 ô A01–A04. Số liệu chỉ dùng cho test. */
export function makeYardZone(overrides: Partial<YardZoneConfig> = {}): YardZoneConfig {
  return { code: 'A', name: 'Khu A', capacity: 4, slotPrefix: 'A', slotCount: 4, active: true, ...overrides };
}

/** Danh mục cổng/làn giả lập cho test — chỉ đủ các hàm mà use-case thật sự gọi. */
export function makeFacilities(): BorderFacilityService {
  const gates = [
    { code: 'A1', name: 'Cửa A1 - Nhập cảnh', direction: GateDirection.ENTRY, checkpoint: 'B1', active: true },
    { code: 'B1', name: 'Cửa B1 - Xuất cảnh', direction: GateDirection.EXIT, checkpoint: 'B2', active: true },
    { code: 'B9', name: 'Cửa B9 - Tạm ngừng', direction: GateDirection.EXIT, checkpoint: 'B2', active: false },
  ];
  const lanes = [
    { code: 'A1-1', name: 'Làn 1 - Cửa A1', gateCode: 'A1', active: true },
    { code: 'B1-1', name: 'Làn 1 - Cửa B1', gateCode: 'B1', active: true },
  ];

  return {
    listGates: async () => gates,
    findGate: async (code: string) => gates.find((gate) => gate.code === code) ?? null,
    listLanes: async () => lanes,
    findLane: async (code: string) => lanes.find((lane) => lane.code === code) ?? null,
    listYardZones: async () => [makeYardZone()],
  } as unknown as BorderFacilityService;
}
