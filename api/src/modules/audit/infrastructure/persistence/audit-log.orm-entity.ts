import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { AuditResult } from '../../../../common/audit/audit-logger.port';

@Entity('audit_logs')
export class AuditLogOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'occurred_at', type: 'timestamptz' })
  at!: Date;

  @Index()
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Index()
  @Column({ name: 'actor_username', type: 'varchar', length: 64, nullable: true })
  actorUsername!: string | null;

  @Column({ name: 'actor_role', type: 'varchar', length: 32, nullable: true })
  actorRole!: string | null;

  @Column({ name: 'ip', type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  @Column({ name: 'correlation_id', type: 'varchar', length: 64, nullable: true })
  correlationId!: string | null;

  @Index()
  @Column({ name: 'action', length: 64 })
  action!: string;

  @Index()
  @Column({ name: 'target_type', length: 64 })
  targetType!: string;

  @Index()
  @Column({ name: 'target_id', type: 'varchar', length: 64, nullable: true })
  targetId!: string | null;

  @Column({ name: 'result', length: 16, default: AuditResult.SUCCESS })
  result!: AuditResult;

  @Column({ name: 'value_before', type: 'jsonb', nullable: true })
  before!: Record<string, unknown> | null;

  @Column({ name: 'value_after', type: 'jsonb', nullable: true })
  after!: Record<string, unknown> | null;
}
