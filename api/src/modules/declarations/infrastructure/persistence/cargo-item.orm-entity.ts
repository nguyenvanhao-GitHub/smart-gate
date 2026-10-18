import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Dòng hàng của hồ sơ — tách khỏi cột `declarations.cargo` (jsonb).
 *
 * Cột cũ chỉ chứa **một** khối hàng hoá, bảng này cho **nhiều dòng**; khi di trú, mỗi hồ sơ có
 * mô tả hàng hoá sinh đúng 1 dòng với `line_no = 1`.
 */
@Entity('cargo_items')
@Index('IDX_cargo_items_dossier_line', ['dossierId', 'lineNo'])
export class CargoItemOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  /** Thứ tự dòng hàng trong hồ sơ, bắt đầu từ 1. */
  @Column({ name: 'line_no', type: 'int' })
  lineNo!: number;

  @Column({ name: 'description', length: 500 })
  description!: string;

  /** Mã trong danh mục `CARGO_TYPE`. */
  @Index()
  @Column({ name: 'cargo_type_code', type: 'varchar', length: 32, nullable: true })
  cargoTypeCode!: string | null;

  @Column({ name: 'quantity', type: 'numeric', precision: 14, scale: 3, nullable: true })
  quantity!: string | null;

  /** Mã trong danh mục `UNIT`. */
  @Column({ name: 'unit_code', type: 'varchar', length: 32, nullable: true })
  unitCode!: string | null;

  @Column({ name: 'gross_weight_kg', type: 'numeric', precision: 14, scale: 3, nullable: true })
  grossWeightKg!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
