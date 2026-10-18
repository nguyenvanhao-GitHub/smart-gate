import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/** Ma trận vai trò × quyền — chính là bảng người dùng tick trên màn UI-13. */
@Entity('role_permissions')
export class RolePermissionOrmEntity {
  @PrimaryColumn({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @PrimaryColumn({ name: 'permission_id', type: 'uuid' })
  permissionId!: string;

  @Index()
  @Column({ name: 'permission_code', length: 64 })
  permissionCode!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
