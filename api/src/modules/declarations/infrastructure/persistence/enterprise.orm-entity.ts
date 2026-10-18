import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Doanh nghiệp khai báo — tách khỏi cột `declarations.enterprise` (jsonb) ở P2.
 * `tax_code` là **khóa tự nhiên**: nhiều hồ sơ cùng trỏ về một doanh nghiệp, không tạo bản ghi trùng.
 */
@Entity('enterprises')
export class EnterpriseOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index('UQ_enterprises_tax_code', { unique: true })
  @Column({ name: 'tax_code', length: 32 })
  taxCode!: string;

  @Column({ name: 'name', length: 200 })
  name!: string;

  @Column({ name: 'representative_name', type: 'varchar', length: 160, nullable: true })
  representativeName!: string | null;

  @Column({ name: 'address', type: 'varchar', length: 255, nullable: true })
  address!: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
