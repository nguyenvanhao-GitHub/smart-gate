import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { PermissionActionCode, PermissionModuleCode } from '../../domain/permission.catalog';

@Entity('permissions')
export class PermissionOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'code', length: 64 })
  code!: string;

  @Index()
  @Column({ name: 'module', length: 32 })
  module!: PermissionModuleCode;

  @Column({ name: 'module_label', length: 64 })
  moduleLabel!: string;

  @Column({ name: 'action', length: 32 })
  action!: PermissionActionCode;

  @Column({ name: 'action_label', length: 64 })
  actionLabel!: string;

  @Column({ name: 'name', length: 160 })
  name!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
