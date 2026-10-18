import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Một lần thu tiền của hồ sơ (F48) — bảng `fee_transactions`.
 *
 * Bảng **chỉ thêm và chuyển trạng thái**, không xóa: đây là chứng từ đối soát. Mã biên lai duy
 * nhất trong phạm vi một hồ sơ được bảo đảm bằng **chỉ mục duy nhất có điều kiện** ở tầng
 * database (bỏ qua giao dịch đã hủy), không phải bằng kiểm-rồi-ghi trong mã.
 */
@Entity('fee_transactions')
export class FeeTransactionOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amount!: string;

  @Column({ length: 16 })
  method!: string;

  @Column({ name: 'reference_code', length: 64 })
  referenceCode!: string;

  @Column({ name: 'attachment_id', type: 'uuid', nullable: true })
  attachmentId!: string | null;

  @Index()
  @Column({ length: 16 })
  status!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'confirmed_by_id', type: 'uuid', nullable: true })
  confirmedById!: string | null;

  @Column({ name: 'confirmed_by_name', type: 'varchar', length: 160, nullable: true })
  confirmedByName!: string | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;
}
