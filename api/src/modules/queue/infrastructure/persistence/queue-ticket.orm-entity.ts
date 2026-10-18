import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Số thứ tự phục vụ (F27) — bảng `queue_tickets`.
 *
 * Hai chỉ mục duy nhất **chỉ tạo được bằng migration** vì đều là chỉ mục nhiều cột, TypeORM
 * không diễn tả nổi bằng decorator:
 * - `uq_queue_tickets_number` (issued_date, flow, ticket_number) — số duy nhất theo **ngày/luồng**,
 *   KHÔNG theo cửa khẩu (BUG-017); khoá được đổi ở migration `QueueTicketNumberPerFlow`.
 * - `uq_queue_tickets_dossier_active` (dossier_id, issued_date) — **một số/hồ sơ/ngày**; cột
 *   `status` (WAITING/CALLED/…) và điều kiện của chỉ mục cũ đã bị bỏ ở migration `DropQueueTicketStatus`.
 */
@Entity('queue_tickets')
export class QueueTicketOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @Column({ name: 'ticket_number', type: 'int' })
  ticketNumber!: number;

  /** Kiểu `date` của PostgreSQL, đọc ra là chuỗi `YYYY-MM-DD`. */
  @Index()
  @Column({ name: 'issued_date', type: 'date' })
  issuedDate!: string;

  @Column({ length: 16 })
  flow!: string;

  @Column({ length: 32 })
  checkpoint!: string;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt!: Date;

  @Column({ name: 'issued_by_id', type: 'uuid', nullable: true })
  issuedById!: string | null;
}
