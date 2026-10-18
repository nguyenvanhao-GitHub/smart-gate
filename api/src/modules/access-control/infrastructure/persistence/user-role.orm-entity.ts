import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import { DataScopeLevel } from '../../domain/data-scope.enum';

/** Một người dùng có thể mang nhiều vai trò, mỗi vai trò có phạm vi dữ liệu riêng. */
@Entity('user_roles')
@Unique('uq_user_roles_user_role', ['userId', 'roleId'])
export class UserRoleOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @Column({ name: 'data_scope', length: 16, default: DataScopeLevel.OWN })
  dataScope!: DataScopeLevel;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
