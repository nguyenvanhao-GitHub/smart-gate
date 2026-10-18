import { DispatchAssignment, DispatchAssignmentStatus } from '../../domain/dispatch-assignment.entity';
import { InspectionStatus } from '../../domain/inspection-status.rules';
import { ParkingSlot, Yard } from '../../domain/yard.entity';
import { DispatchAssignmentOrmEntity } from './dispatch-assignment.orm-entity';
import { ParkingSlotOrmEntity } from './parking-slot.orm-entity';
import { YardOrmEntity } from './yard.orm-entity';

export class DispatchMapper {
  static toDomain(row: DispatchAssignmentOrmEntity): DispatchAssignment {
    return new DispatchAssignment(
      row.id,
      row.dossierId,
      row.gateCode,
      row.laneCode,
      row.yardId,
      row.slotCode,
      row.status as DispatchAssignmentStatus,
      new Date(row.assignedAt),
      row.releasedAt ? new Date(row.releasedAt) : null,
      row.assignedById,
      row.note,
      new Date(row.updatedAt),
      row.inspectionStatus as InspectionStatus,
      row.inspectionUpdatedAt ? new Date(row.inspectionUpdatedAt) : null,
    );
  }

  static toPersistence(assignment: DispatchAssignment): DispatchAssignmentOrmEntity {
    const row = new DispatchAssignmentOrmEntity();
    row.id = assignment.id;
    row.dossierId = assignment.dossierId;
    row.gateCode = assignment.gateCode;
    row.laneCode = assignment.laneCode;
    row.yardId = assignment.yardId;
    row.slotCode = assignment.slotCode;
    row.status = assignment.status;
    row.assignedAt = assignment.assignedAt;
    row.releasedAt = assignment.releasedAt;
    row.assignedById = assignment.assignedById;
    row.note = assignment.note;
    row.updatedAt = assignment.updatedAt;
    row.inspectionStatus = assignment.inspectionStatus;
    row.inspectionUpdatedAt = assignment.inspectionUpdatedAt;
    return row;
  }
}

export class YardMapper {
  static toDomain(row: YardOrmEntity, slots: ParkingSlotOrmEntity[]): Yard {
    return new Yard(
      row.id,
      row.code,
      row.name,
      Number(row.capacity),
      row.isActive,
      slots
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code))
        .map((slot) => new ParkingSlot(slot.id, slot.yardId, slot.code, slot.sortOrder, slot.isActive)),
    );
  }

  static toPersistence(yard: Yard): YardOrmEntity {
    const row = new YardOrmEntity();
    row.id = yard.id;
    row.code = yard.code;
    row.name = yard.name;
    row.capacity = yard.capacity;
    row.isActive = yard.isActive;
    return row;
  }

  static toSlotPersistence(slot: ParkingSlot): ParkingSlotOrmEntity {
    const row = new ParkingSlotOrmEntity();
    row.id = slot.id;
    row.yardId = slot.yardId;
    row.code = slot.code;
    row.sortOrder = slot.sortOrder;
    row.isActive = slot.isActive;
    return row;
  }
}
