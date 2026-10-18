import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Khoản phí đã chốt của một hồ sơ (F47) — bảng `fee_charges`.
 *
 * Cả `quantity`, `unit_amount` và `amount` đều là `numeric` để phép cộng dồn không mất chính xác;
 * `quantity` giữ 3 chữ số thập phân cho đơn vị tấn, hai cột tiền giữ 2 chữ số theo thông lệ kế toán
 * (giá trị thực tế luôn là số nguyên đồng).
 */
@Entity('fee_charges')
export class FeeChargeOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @Column({ name: 'rule_id', type: 'uuid', nullable: true })
  ruleId!: string | null;

  @Index()
  @Column({ name: 'rule_code', length: 32 })
  ruleCode!: string;

  @Column({ length: 160 })
  name!: string;

  @Column({ length: 16 })
  unit!: string;

  @Column({ type: 'numeric', precision: 18, scale: 3, default: 0 })
  quantity!: string;

  @Column({ name: 'unit_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  unitAmount!: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  amount!: string;

  @Column({ name: 'is_adjusted', type: 'boolean', default: false })
  adjusted!: boolean;

  @Column({ name: 'reason_code', type: 'varchar', length: 32, nullable: true })
  reasonCode!: string | null;

  @Column({ name: 'reason_note', type: 'varchar', length: 500, nullable: true })
  reasonNote!: string | null;

  @Column({ name: 'adjusted_by_id', type: 'uuid', nullable: true })
  adjustedById!: string | null;

  @Column({ name: 'adjusted_at', type: 'timestamptz', nullable: true })
  adjustedAt!: Date | null;

  @Column({ name: 'calculated_at', type: 'timestamptz' })
  calculatedAt!: Date;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;
}
