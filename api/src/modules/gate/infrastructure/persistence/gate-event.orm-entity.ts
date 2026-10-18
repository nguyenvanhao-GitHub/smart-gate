import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { GateChecklistState } from '../../domain/gate-event.entity';

/**
 * Sự kiện qua cổng (F38) — bảng `gate_events`. Bảng **chỉ thêm**, không sửa/xoá: đây là dấu vết
 * nghiệp vụ, `blockingReasons` và `checklist` giữ nguyên trạng lúc ra quyết định.
 */
@Entity('gate_events')
export class GateEventOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @Index()
  @Column({ name: 'gate_code', length: 32 })
  gateCode!: string;

  @Column({ length: 16 })
  direction!: string;

  @Column({ length: 16 })
  decision!: string;

  @Column({ name: 'can_open', type: 'boolean' })
  canOpen!: boolean;

  @Column({ name: 'status_color', length: 16 })
  statusColor!: string;

  @Column({ name: 'blocking_reasons', type: 'jsonb', default: () => "'[]'::jsonb" })
  blockingReasons!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  checklist!: GateChecklistState[];

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  @Column({ name: 'actor_name', type: 'varchar', length: 160, nullable: true })
  actorName!: string | null;

  @Index()
  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;
}
