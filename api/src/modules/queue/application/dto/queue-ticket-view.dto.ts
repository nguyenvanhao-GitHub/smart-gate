import { QueueFlow } from '../../domain/queue-ticket.entity';
import { QueueTicketRow } from '../ports/queue-ticket.repository';

/** Hợp đồng dữ liệu số thứ tự trả cho web (F27) — số thuần, không mang trạng thái gọi. */
export interface QueueTicketView {
  id: string;
  dossierId: string;
  dossierCode: string;
  plateNumber: string;
  enterpriseName: string;
  ticketNumber: number;
  /** Format: dd/mm/yyyy.0001 */
  ticketCode: string;
  /** `YYYY-MM-DD`. */
  issuedDate: string;
  flow: QueueFlow;
  checkpoint: string;
  issuedAt: Date;
}

export function toQueueTicketView(row: QueueTicketRow): QueueTicketView {
  return {
    id: row.ticket.id,
    dossierId: row.ticket.dossierId,
    dossierCode: row.dossierCode,
    plateNumber: row.plateNumber,
    enterpriseName: row.enterpriseName,
    ticketNumber: row.ticket.ticketNumber,
    ticketCode: row.ticket.ticketCode,
    issuedDate: row.ticket.issuedDate,
    flow: row.ticket.flow,
    checkpoint: row.ticket.checkpoint,
    issuedAt: row.ticket.issuedAt,
  };
}
