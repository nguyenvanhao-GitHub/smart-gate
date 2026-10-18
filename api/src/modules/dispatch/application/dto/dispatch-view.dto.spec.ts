import { DeclarationStatus, DeclarationType } from '../../../declarations/domain/declaration.enums';
import { DispatchAssignment, DispatchAssignmentStatus } from '../../domain/dispatch-assignment.entity';
import { InspectionStatus } from '../../domain/inspection-status.rules';
import { computeExpectedDeparture } from '../../domain/yard-storage.rules';
import { ParkingSlot, ParkingSlotStatus, Yard } from '../../domain/yard.entity';
import { DispatchAssignmentWithDossier, DispatchBoardRow } from '../ports/dispatch-assignment.repository';
import { toDispatchCard, toYardDetailView } from './dispatch-view.dto';

function makeBoardRow(overrides: Partial<DispatchBoardRow> = {}): DispatchBoardRow {
  return {
    dossierId: overrides.dossierId ?? 'ho-so-1',
    dossierCode: overrides.dossierCode ?? 'CK-2026-0001',
    plateNumber: overrides.plateNumber ?? '26C-123.45',
    enterpriseName: overrides.enterpriseName ?? 'Công ty TNHH Chiềng Khương',
    dossierStatus: overrides.dossierStatus ?? DeclarationStatus.SUBMITTED,
    dossierType: overrides.dossierType ?? DeclarationType.IMPORT,
    ticketNumber: overrides.ticketNumber ?? 5,
    waitingSince: overrides.waitingSince ?? new Date('2026-07-28T08:00:00.000Z'),
    currentStepCode: overrides.currentStepCode ?? null,
    activeStepCodes: overrides.activeStepCodes ?? [],
    assignment: overrides.assignment ?? null,
  };
}

describe('toDispatchCard — ánh xạ thẻ phương tiện', () => {
  const now = new Date('2026-07-28T08:01:40.000Z');

  it('ánh xạ đầy đủ các trường thẻ, kèm số giây chờ tính từ waitingSince', () => {
    const assignment = new DispatchAssignment(
      'asg-1',
      'ho-so-1',
      'GATE-1',
      'LANE-A',
      'yard-1',
      'A-01',
      DispatchAssignmentStatus.ACTIVE,
      new Date('2026-07-28T07:50:00.000Z'),
      null,
      'user-dp',
      null,
      new Date('2026-07-28T07:50:00.000Z'),
      InspectionStatus.WAITING_INSPECTION,
      null,
    );
    const card = toDispatchCard(makeBoardRow({ ticketNumber: 12, assignment }), now);

    expect(card.dossierId).toBe('ho-so-1');
    expect(card.code).toBe('CK-2026-0001');
    expect(card.plateNumber).toBe('26C-123.45');
    expect(card.ticketNumber).toBe(12);
    expect(card.ticketCode).toBe('28/07/2026.0012');
    expect(card.status).toBe(DeclarationStatus.SUBMITTED);
    expect(card.waitingSeconds).toBe(100);
    expect(card.assignment).toEqual({ id: 'asg-1', gateCode: 'GATE-1', laneCode: 'LANE-A', yardId: 'yard-1', slotCode: 'A-01' });
  });

  it('thẻ không có vị trí thì assignment = null', () => {
    const card = toDispatchCard(makeBoardRow({ assignment: null }), now);
    expect(card.assignment).toBeNull();
  });

  it('thẻ có vị trí nhưng đã giải phóng (RELEASED) thì assignment = null', () => {
    const assignment = new DispatchAssignment(
      'asg-1',
      'ho-so-1',
      'GATE-1',
      'LANE-A',
      'yard-1',
      'A-01',
      DispatchAssignmentStatus.RELEASED,
      new Date('2026-07-28T07:50:00.000Z'),
      new Date('2026-07-28T08:00:00.000Z'),
      'user-dp',
      null,
      new Date('2026-07-28T08:00:00.000Z'),
      InspectionStatus.WAITING_INSPECTION,
      null,
    );
    const card = toDispatchCard(makeBoardRow({ assignment }), now);
    expect(card.assignment).toBeNull();
  });
});

describe('toYardDetailView — sơ đồ ô đỗ, quá hạn và bảo trì (F42/F44, UI-10)', () => {
  const now = new Date('2026-07-30T00:00:00.000Z');
  const maxHours = 48;

  /** Khu 4 ô: A01 trống, A02 có xe chưa quá hạn, A03 có xe quá hạn, A04 bị khoá (bảo trì). */
  function makeYard(): Yard {
    const yard = Yard.create('A', 'Khu A', 4);
    yard.slots = [
      new ParkingSlot('slot-1', yard.id, 'A01', 1, true),
      new ParkingSlot('slot-2', yard.id, 'A02', 2, true),
      new ParkingSlot('slot-3', yard.id, 'A03', 3, true),
      new ParkingSlot('slot-4', yard.id, 'A04', 4, false), // bị khoá
    ];
    return yard;
  }

  function occupant(slotCode: string, assignedAt: Date, enterpriseName: string): DispatchAssignmentWithDossier {
    const assignment = DispatchAssignment.assign({
      dossierId: `ho-so-${slotCode}`,
      gateCode: null,
      laneCode: null,
      yardId: 'yard-1',
      slotCode,
      assignedById: null,
      note: null,
      at: assignedAt,
    });
    return { assignment, dossierCode: `CK-${slotCode}`, plateNumber: `26C-${slotCode}`, enterpriseName };
  }

  // A03 vào bãi cách "now" 50 giờ (> 48) → quá hạn; A02 vào bãi 10 giờ trước → chưa quá hạn.
  const sinceOverdue = new Date(now.getTime() - 50 * 3_600_000);
  const sinceFresh = new Date(now.getTime() - 10 * 3_600_000);

  function build() {
    const occupants: DispatchAssignmentWithDossier[] = [
      occupant('A02', sinceFresh, 'Công ty TNHH Chiềng Khương'),
      occupant('A03', sinceOverdue, 'HTX Tân Thanh'),
    ];
    return toYardDetailView(makeYard(), occupants, now, maxHours);
  }

  it('ô có xe quá mốc dự kiến rời bãi thì overdue = true, còn trong hạn thì false', () => {
    const view = build();
    const a02 = view.slots.find((slot) => slot.code === 'A02')!;
    const a03 = view.slots.find((slot) => slot.code === 'A03')!;

    expect(a02.status).toBe(ParkingSlotStatus.OCCUPIED);
    expect(a02.overdue).toBe(false);
    expect(a03.status).toBe(ParkingSlotStatus.OCCUPIED);
    expect(a03.overdue).toBe(true);
  });

  it('ô có xe kèm tên doanh nghiệp và dự kiến rời bãi = giờ vào bãi + giờ lưu tối đa', () => {
    const view = build();
    const a02 = view.slots.find((slot) => slot.code === 'A02')!;

    expect(a02.assignment?.entity).toBe('Công ty TNHH Chiềng Khương');
    expect(a02.assignment?.expectedDeparture).toEqual(computeExpectedDeparture(sinceFresh, maxHours));
    expect(a02.assignment?.since).toEqual(sinceFresh);
  });

  it('ô isActive = false hiện MAINTENANCE, không overdue, không assignment', () => {
    const view = build();
    const a04 = view.slots.find((slot) => slot.code === 'A04')!;

    expect(a04.status).toBe(ParkingSlotStatus.MAINTENANCE);
    expect(a04.overdue).toBe(false);
    expect(a04.assignment).toBeNull();
  });

  it('ô trống còn khai thác hiện FREE', () => {
    const view = build();
    const a01 = view.slots.find((slot) => slot.code === 'A01')!;

    expect(a01.status).toBe(ParkingSlotStatus.FREE);
    expect(a01.assignment).toBeNull();
  });

  it('YardSummaryView đếm đúng số ô đang có xe và số ô quá hạn', () => {
    const view = build();

    expect(view.occupied).toBe(2);
    expect(view.overdue).toBe(1); // chỉ A03 quá hạn
    expect(view.capacity).toBe(4);
  });

  it('thiếu mốc vào bãi thì expectedDeparture = null và không tính quá hạn', () => {
    const assignment = DispatchAssignment.assign({
      dossierId: 'ho-so-x',
      gateCode: null,
      laneCode: null,
      yardId: 'yard-1',
      slotCode: 'A01',
      assignedById: null,
      note: null,
    });
    // Hồ sơ cũ không có giờ vào bãi (denormalized rỗng) — nhánh phòng thủ trong toYardDetailView.
    (assignment as { assignedAt: Date | null }).assignedAt = null;
    const occupants: DispatchAssignmentWithDossier[] = [
      { assignment, dossierCode: 'CK-X', plateNumber: '26C-X', enterpriseName: '' },
    ];

    const view = toYardDetailView(makeYard(), occupants, now, maxHours);
    const a01 = view.slots.find((slot) => slot.code === 'A01')!;

    expect(a01.assignment?.expectedDeparture).toBeNull();
    expect(a01.overdue).toBe(false);
  });
});
