import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Phương tiện của hồ sơ — tách khỏi cột `declarations.vehicle` (jsonb).
 * **Đúng một phương tiện/hồ sơ** (CR8): `dossier_id` là chỉ mục **duy nhất**. Cho phép trùng biển số
 * giữa các hồ sơ (F09 đã bỏ ở P12) nên không có ràng buộc duy nhất trên biển số.
 */
@Entity('vehicles')
export class VehicleOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index('uq_vehicles_dossier', { unique: true })
  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @Index()
  @Column({ name: 'plate_number', length: 32 })
  plateNumber!: string;

  @Index()
  @Column({ name: 'container_number', type: 'varchar', length: 64, nullable: true })
  containerNumber!: string | null;

  @Index()
  @Column({ name: 'trailer_number', type: 'varchar', length: 64, nullable: true })
  trailerNumber!: string | null;

  @Column({ name: 'transport_license_number', type: 'varchar', length: 64, nullable: true })
  transportLicenseNumber!: string | null;

  /** Mã trong danh mục `VEHICLE_TYPE`. */
  @Column({ name: 'vehicle_type', type: 'varchar', length: 32, nullable: true })
  vehicleType!: string | null;

  @Column({ name: 'weight_kg', type: 'numeric', precision: 12, scale: 2, nullable: true })
  weightKg!: string | null;

  // Lái xe nhúng theo từng phương tiện (BUG-033) — thay cho bảng `drivers` một-hồ-sơ-một-lái-xe.
  @Column({ name: 'driver_full_name', type: 'varchar', length: 160, nullable: true })
  driverFullName!: string | null;

  @Index('IDX_vehicles_driver_id_number')
  @Column({ name: 'driver_id_number', type: 'varchar', length: 32, nullable: true })
  driverIdNumber!: string | null;

  @Column({ name: 'driver_id_type', type: 'varchar', length: 32, nullable: true })
  driverIdType!: string | null;

  @Column({ name: 'driver_phone', type: 'varchar', length: 32, nullable: true })
  driverPhone!: string | null;

  @Column({ name: 'driver_license_number', type: 'varchar', length: 32, nullable: true })
  driverLicenseNumber!: string | null;

  @Column({ name: 'driver_nationality', type: 'varchar', length: 32, nullable: true })
  driverNationality!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
