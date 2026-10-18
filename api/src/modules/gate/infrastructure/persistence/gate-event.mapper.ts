import { GateDirection } from '../../../catalog/domain/border-facility.catalog';
import { GateDecision, GateEvent, GateStatusColor } from '../../domain/gate-event.entity';
import { GateEventOrmEntity } from './gate-event.orm-entity';

export class GateEventMapper {
  static toDomain(row: GateEventOrmEntity): GateEvent {
    return new GateEvent(
      row.id,
      row.dossierId,
      row.gateCode,
      row.direction as GateDirection,
      row.decision as GateDecision,
      row.canOpen,
      row.statusColor as GateStatusColor,
      row.blockingReasons ?? [],
      row.checklist ?? [],
      row.note,
      row.actorId,
      row.actorName,
      new Date(row.occurredAt),
    );
  }

  static toPersistence(event: GateEvent): GateEventOrmEntity {
    const row = new GateEventOrmEntity();
    row.id = event.id;
    row.dossierId = event.dossierId;
    row.gateCode = event.gateCode;
    row.direction = event.direction;
    row.decision = event.decision;
    row.canOpen = event.canOpen;
    row.statusColor = event.statusColor;
    row.blockingReasons = event.blockingReasons;
    row.checklist = event.checklist;
    row.note = event.note;
    row.actorId = event.actorId;
    row.actorName = event.actorName;
    row.occurredAt = event.occurredAt;
    return row;
  }
}
