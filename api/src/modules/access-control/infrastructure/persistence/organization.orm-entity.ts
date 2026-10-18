import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { OrganizationType } from '../../domain/organization.catalog';

@Entity('organizations')
export class OrganizationOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'code', length: 64 })
  code!: string;

  @Column({ name: 'name', length: 200 })
  name!: string;

  @Column({ name: 'type', length: 32, default: OrganizationType.AGENCY })
  type!: OrganizationType;

  // Cây đơn vị luôn được duyệt theo cha — index để `synchronize` và migration không lệch nhau.
  @Index()
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
