import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('dossier_field_configs')
@Index('UQ_dossier_field_configs_type_field', ['dossierTypeCode', 'fieldKey'], { unique: true })
export class DossierFieldConfigOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'catalog_item_id', type: 'uuid', nullable: true })
  catalogItemId?: string | null;

  @Column({ name: 'dossier_type_code', type: 'varchar', length: 64, nullable: true })
  dossierTypeCode?: string | null;

  @Column({ name: 'field_key', type: 'varchar', length: 64 })
  fieldKey!: string;

  @Column({ name: 'is_visible', type: 'boolean', default: true })
  isVisible!: boolean;

  @Column({ name: 'is_required', type: 'boolean', default: false })
  isRequired!: boolean;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
