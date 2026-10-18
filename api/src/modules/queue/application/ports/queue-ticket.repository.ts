import { QueueTicket } from '../../domain/queue-ticket.entity';

export const QUEUE_TICKET_REPOSITORY = Symbol('QUEUE_TICKET_REPOSITORY');

/** Ràng buộc duy nhất nào bị đụng — quyết định cách use-case xử lý tiếp. */
export type QueueTicketConflictScope =
  /** Trùng (ngày, số) — cấp lại số khác rồi thử lại. */
  | 'NUMBER'
  /** Hồ sơ đã có số còn hiệu lực trong ngày — đọc lại và trả về số cũ. */
  | 'DOSSIER';

export class QueueTicketConflictError extends Error {
  constructor(public readonly scope: QueueTicketConflictScope) {
    super(`Ràng buộc duy nhất của số thứ tự bị đụng: ${scope}`);
    this.name = 'QueueTicketConflictError';
  }
}

/** Một số thứ tự kèm thông tin hồ sơ để hiển thị. */
export interface QueueTicketRow {
  ticket: QueueTicket;
  dossierCode: string;
  plateNumber: string;
  enterpriseName: string;
}

export interface QueueTicketRepository {
  /**
   * Ghi số mới. **Ném `QueueTicketConflictError`** khi đụng chỉ mục duy nhất — tầng ứng dụng
   * dựa vào đó để thử lại, chứ không tự kiểm trước rồi ghi (kiểm-rồi-ghi luôn có khe hở).
   */
  insert(ticket: QueueTicket): Promise<QueueTicket>;
  /** Số kế tiếp trong ngày. Chỉ là **gợi ý**; database mới là nơi chốt. */
  nextNumber(issuedDate: string): Promise<number>;
  /** Số đã cấp cho hồ sơ trong ngày; đảm bảo **một số/hồ sơ/ngày** (idempotent khi cấp lại). */
  findActiveByDossier(dossierId: string, issuedDate: string): Promise<QueueTicket | null>;
  /**
   * Số thứ tự **gần nhất** đã cấp cho hồ sơ (mọi ngày). Dùng để hiển thị kèm lịch sử điều phối
   * (F33/BUG-084); `null` nếu hồ sơ chưa từng được cấp số.
   */
  findLatestByDossier(dossierId: string): Promise<QueueTicket | null>;
}
