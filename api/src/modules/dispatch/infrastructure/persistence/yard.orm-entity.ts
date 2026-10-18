import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** Khu bãi (F42) — bảng `yards`. Dựng từ danh mục `YARD_ZONE`, xem `YardProvisioningService`. */
@Entity('yards')
export class YardOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ length: 32 })
  code!: string;

  @Column({ length: 160 })
  name!: string;

  @Column({ type: 'int', default: 0 })
  capacity!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
