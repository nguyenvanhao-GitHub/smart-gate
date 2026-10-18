import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Một bản của biểu phí (F46) — bảng `fee_rules`.
 *
 * `amount` là `numeric(18,2)`, **không phải** `float`/`double precision`: tiền không bao giờ được
 * lưu bằng số thực nhị phân. Driver `pg` trả `numeric` về dạng chuỗi nên mapper tự đổi sang
 * `number` — an toàn vì trần `Number.MAX_SAFE_INTEGER` lớn hơn mọi khoản phí cửa khẩu nhiều bậc.
 *
 * Ngày hiệu lực để kiểu `date` và đọc lên dạng chuỗi `YYYY-MM-DD` — so sánh từ điển trùng khít với
 * so sánh thời gian, không dính lệch múi giờ.
 */
@Entity('fee_rules')
export class FeeRuleOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ length: 32 })
  code!: string;

  @Column({ length: 160 })
  name!: string;

  @Column({ name: 'fee_type', length: 32 })
  feeType!: string;

  @Column({ length: 16 })
  unit!: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amount!: string;

  @Column({ length: 8, default: 'VND' })
  currency!: string;

  /** Loại hồ sơ áp dụng; mảng rỗng = áp dụng cho mọi loại hồ sơ. */
  @Column({ name: 'applies_to', type: 'jsonb', default: () => "'[]'::jsonb" })
  appliesTo!: string[];

  @Index()
  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  active!: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'text', nullable: true })
  description!: string | null;
}
