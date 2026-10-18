import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Ô đỗ (F42) — bảng `parking_slots`. Mã ô duy nhất trong phạm vi khu, ràng buộc bằng chỉ mục
 * `uq_parking_slots_yard_code` tạo trong migration.
 */
@Entity('parking_slots')
export class ParkingSlotOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'yard_id', type: 'uuid' })
  yardId!: string;

  @Column({ length: 32 })
  code!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
