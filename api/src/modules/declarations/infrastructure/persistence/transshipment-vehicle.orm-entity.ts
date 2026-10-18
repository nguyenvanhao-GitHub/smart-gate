import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Phương tiện **nhận sang tải** của hồ sơ loại Sang tải (TRANSSHIPMENT) — CR9/CR18/CR33.
 *
 * Khác `vehicles` (phương tiện vận chuyển chính, nay chỉ một xe/hồ sơ): đây là các xe nhận hàng
 * sang tải, mỗi xe có **tên lái xe** (theo mockup chỉ là tên — #S1), gắn với biển số xe gốc trong
 * hồ sơ. Khuôn theo `cargo_items`: nhiều dòng, giữ thứ tự ở `line_no`.
 */
@Entity('transshipment_vehicles')
@Index('IDX_transshipment_vehicles_dossier_line', ['dossierId', 'lineNo'])
export class TransshipmentVehicleOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index('IDX_transshipment_vehicles_dossier')
  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  /** Thứ tự xe sang tải trong hồ sơ, bắt đầu từ 1. */
  @Column({ name: 'line_no', type: 'int' })
  lineNo!: number;

  /** Biển số xe chở hàng gốc (chọn từ phương tiện của hồ sơ). */
  @Column({ name: 'source_plate', type: 'varchar', length: 32, nullable: true })
  sourcePlate!: string | null;

  @Column({ name: 'plate_number', length: 32 })
  plateNumber!: string;

  /** Mã trong danh mục `VEHICLE_TYPE`. */
  @Column({ name: 'vehicle_type', type: 'varchar', length: 32, nullable: true })
  vehicleType!: string | null;

  @Column({ name: 'container_number', type: 'varchar', length: 64, nullable: true })
  containerNumber!: string | null;

  @Column({ name: 'trailer_number', type: 'varchar', length: 64, nullable: true })
  trailerNumber!: string | null;

  /** Tên lái xe nhận sang tải (mockup chỉ khai tên — #S1). */
  @Column({ name: 'driver_name', type: 'varchar', length: 160, nullable: true })
  driverName!: string | null;

  /** Phí 01 — giữ nguyên chuỗi người dùng nhập (vd "800.000") để không mất cách trình bày. */
  @Column({ name: 'fee01', type: 'varchar', length: 32, nullable: true })
  fee01!: string | null;

  @Column({ name: 'transfer_place', type: 'varchar', length: 200, nullable: true })
  transferPlace!: string | null;

  @Column({ name: 'note', type: 'varchar', length: 500, nullable: true })
  note!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
