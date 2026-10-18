import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** Nhật ký thao tác của lực lượng chuyên ngành — chỉ ghi thêm, là bằng chứng cho F23–F25. */
@Entity('agency_actions')
export class AgencyActionOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @Index()
  @Column({ name: 'instance_id', type: 'uuid' })
  instanceId!: string;

  @Index()
  @Column({ name: 'step_code', length: 64 })
  stepCode!: string;

  @Index()
  @Column({ name: 'agency_code', type: 'varchar', length: 32, nullable: true })
  agencyCode!: string | null;

  @Index()
  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  @Column({ name: 'actor_name', type: 'varchar', length: 160, nullable: true })
  actorName!: string | null;

  @Column({ length: 32 })
  decision!: string;

  @Column({ name: 'reason_code', type: 'varchar', length: 32, nullable: true })
  reasonCode!: string | null;

  @Column({ name: 'reason_note', type: 'varchar', length: 500, nullable: true })
  reasonNote!: string | null;

  /** F26 — số giây lực lượng giữ hồ sơ, chốt tại thời điểm ra quyết định. */
  @Column({ name: 'elapsed_seconds', type: 'int', default: 0 })
  elapsedSeconds!: number;

  @Index()
  @Column({ name: 'acted_at', type: 'timestamptz' })
  actedAt!: Date;
}
