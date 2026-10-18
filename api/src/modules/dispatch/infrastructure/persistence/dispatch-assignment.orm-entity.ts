import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Vị trí điều phối (F29, F31, F43) — bảng `dispatch_assignments`.
 *
 * Hai chỉ mục duy nhất **có điều kiện** chỉ tạo được bằng migration (TypeORM không diễn tả được
 * mệnh đề `WHERE` trên `@Index`):
 * - `uq_dispatch_assignments_active_dossier` (dossier_id) WHERE status = 'ACTIVE' → 1 xe = 1 vị trí
 * - `uq_dispatch_assignments_active_slot` (yard_id, slot_code) WHERE status = 'ACTIVE' → 1 ô = 1 xe
 */
@Entity('dispatch_assignments')
export class DispatchAssignmentOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @Column({ name: 'gate_code', type: 'varchar', length: 32, nullable: true })
  gateCode!: string | null;

  @Column({ name: 'lane_code', type: 'varchar', length: 32, nullable: true })
  laneCode!: string | null;

  @Index()
  @Column({ name: 'yard_id', type: 'uuid', nullable: true })
  yardId!: string | null;

  @Column({ name: 'slot_code', type: 'varchar', length: 32, nullable: true })
  slotCode!: string | null;

  @Index()
  @Column({ length: 16 })
  status!: string;

  @Column({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt!: Date;

  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt!: Date | null;

  @Column({ name: 'assigned_by_id', type: 'uuid', nullable: true })
  assignedById!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /** Trạng thái kiểm tra/tập kết của lượt đỗ (F44). */
  @Column({ name: 'inspection_status', type: 'varchar', length: 32, default: 'WAITING_INSPECTION' })
  inspectionStatus!: string;

  @Column({ name: 'inspection_updated_at', type: 'timestamptz', nullable: true })
  inspectionUpdatedAt!: Date | null;
}
