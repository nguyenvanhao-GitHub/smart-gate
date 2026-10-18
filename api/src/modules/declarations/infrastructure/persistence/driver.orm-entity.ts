import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Tài xế khai trên hồ sơ — bảng mới ở P2 (cột `jsonb` cũ **không** có dữ liệu tài xế).
 *
 * Giả định: mỗi hồ sơ một tài xế, bản ghi thuộc về hồ sơ chứ chưa phải danh mục người lái dùng
 * chung. Khi cần hồ sơ lịch sử theo người lái thì tách tiếp bằng `id_number` làm khóa tự nhiên.
 */
@Entity('drivers')
export class DriverOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index('UQ_drivers_dossier', { unique: true })
  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @Column({ name: 'full_name', length: 160 })
  fullName!: string;

  @Index()
  @Column({ name: 'id_number', length: 32 })
  idNumber!: string;

  /** CCCD / hộ chiếu / giấy thông hành. */
  @Column({ name: 'id_type', type: 'varchar', length: 32, nullable: true })
  idType!: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Column({ name: 'license_number', type: 'varchar', length: 32, nullable: true })
  licenseNumber!: string | null;

  @Column({ name: 'nationality', type: 'varchar', length: 32, nullable: true })
  nationality!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
