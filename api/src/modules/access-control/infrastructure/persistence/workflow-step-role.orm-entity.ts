import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

/** Vai trò nào được xác nhận bước nghiệp vụ nào — thay bảng cứng trong WorkflowPolicyService (P3). */
@Entity('workflow_step_roles')
@Unique('uq_workflow_step_roles_step_role', ['stepCode', 'roleId'])
export class WorkflowStepRoleOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'step_code', length: 64 })
  stepCode!: string;

  @Column({ name: 'force_code', type: 'varchar', length: 32, nullable: true })
  force!: string | null;

  @Index()
  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
