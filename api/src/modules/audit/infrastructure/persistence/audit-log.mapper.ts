import { AuditLog } from '../../domain/audit-log.entity';
import { AuditLogOrmEntity } from './audit-log.orm-entity';

export class AuditLogMapper {
  static toDomain(row: AuditLogOrmEntity): AuditLog {
    return new AuditLog(
      row.id,
      row.at,
      row.actorId,
      row.actorUsername,
      row.actorRole,
      row.ip,
      row.correlationId,
      row.action,
      row.targetType,
      row.targetId,
      row.result,
      row.before,
      row.after,
    );
  }

  static toPersistence(entry: AuditLog): AuditLogOrmEntity {
    const row = new AuditLogOrmEntity();
    row.id = entry.id;
    row.at = entry.at;
    row.actorId = entry.actorId;
    row.actorUsername = entry.actorUsername;
    row.actorRole = entry.actorRole;
    row.ip = entry.ip;
    row.correlationId = entry.correlationId;
    row.action = entry.action;
    row.targetType = entry.targetType;
    row.targetId = entry.targetId;
    row.result = entry.result;
    row.before = entry.before;
    row.after = entry.after;
    return row;
  }
}
