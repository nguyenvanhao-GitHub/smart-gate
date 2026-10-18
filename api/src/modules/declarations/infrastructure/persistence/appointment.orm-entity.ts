import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { AppointmentStatus } from '../../domain/declaration.enums';

/**
 * Lịch hẹn qua cửa khẩu của hồ sơ — bảng mới ở P2 (cột `jsonb` cũ **không** có dữ liệu lịch hẹn).
 * Mỗi hồ sơ một lịch hẹn nên `dossier_id` là duy nhất; việc điều phối làn/cổng thuộc P4.
 */
@Entity('appointments')
export class AppointmentOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index('UQ_appointments_dossier', { unique: true })
  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @Index()
  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ name: 'gate_code', type: 'varchar', length: 32, nullable: true })
  gateCode!: string | null;

  @Column({ name: 'lane_code', type: 'varchar', length: 32, nullable: true })
  laneCode!: string | null;

  @Column({ name: 'status', length: 16, default: AppointmentStatus.SCHEDULED })
  status!: AppointmentStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
