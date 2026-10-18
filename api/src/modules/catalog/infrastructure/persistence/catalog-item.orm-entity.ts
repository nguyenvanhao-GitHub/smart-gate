import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CatalogItemStatus } from '../../domain/catalog-status.enum';

@Entity('catalog_items')
@Unique('uq_catalog_items_type_code', ['typeCode', 'code'])
export class CatalogItemOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'type_code', length: 64 })
  typeCode!: string;

  @Column({ name: 'code', length: 64 })
  code!: string;

  @Column({ name: 'name', length: 200 })
  name!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Index()
  @Column({ name: 'status', length: 16, default: CatalogItemStatus.ACTIVE })
  status!: CatalogItemStatus;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
