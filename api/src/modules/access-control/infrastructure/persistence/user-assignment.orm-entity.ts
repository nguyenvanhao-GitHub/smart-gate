import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import { AssignmentType } from '../../domain/assignment-type.enum';

/** Phạm vi làm việc được phân công: cửa khẩu, chốt B1/B2/B5, cổng, bãi, loại kiểm dịch… */
@Entity('user_assignments')
@Unique('uq_user_assignments_user_type_value', ['userId', 'type', 'value'])
export class UserAssignmentOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'assignment_type', length: 32 })
  type!: AssignmentType;

  @Column({ name: 'assignment_value', length: 64 })
  value!: string;

  @Column({ name: 'label', type: 'varchar', length: 160, nullable: true })
  label!: string | null;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
