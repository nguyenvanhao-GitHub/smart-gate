import { QueueTicketConflictError, QueueTicketRepository } from '../application/ports/queue-ticket.repository';
import {QueueTicket } from '../domain/queue-ticket.entity';

/**
 * Kho số thứ tự trong bộ nhớ — KHÔNG dùng trong mã sản phẩm.
 *
 * Bắt chước đúng hành vi của PostgreSQL: **hai chỉ mục duy nhất được kiểm ngay lúc ghi**, chứ
 * không phải kiểm trước. `nextNumber()` cố tình nhường lượt cho vòng lặp sự kiện để hai lời gọi
 * song song cùng đọc được một số — đúng tình huống hai quầy bấm cấp số cùng lúc.
 */
export class InMemoryQueueTicketRepository implements QueueTicketRepository {
  readonly rows: QueueTicket[] = [];

  /** Số lần `nextNumber()` nhường lượt; đặt 0 để test tuần tự cho nhanh. */
  constructor(private readonly yieldTimes = 2) {}

  async insert(ticket: QueueTicket): Promise<QueueTicket> {
    const dossierTaken = this.rows.some(
      (row) => row.dossierId === ticket.dossierId && row.issuedDate === ticket.issuedDate,
    );
    if (dossierTaken) throw new QueueTicketConflictError('DOSSIER');

    const numberTaken = this.rows.some(
      (row) =>
        row.issuedDate === ticket.issuedDate &&
        row.ticketNumber === ticket.ticketNumber,
    );
    if (numberTaken) throw new QueueTicketConflictError('NUMBER');

    this.rows.push(ticket);
    return ticket;
  }

  async nextNumber(issuedDate: string): Promise<number> {
    for (let index = 0; index < this.yieldTimes; index += 1) await Promise.resolve();
    const numbers = this.rows
      .filter((row) => row.issuedDate === issuedDate)
      .map((row) => row.ticketNumber);
    return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
  }

  async findActiveByDossier(dossierId: string, issuedDate: string): Promise<QueueTicket | null> {
    return this.rows.find((row) => row.dossierId === dossierId && row.issuedDate === issuedDate) ?? null;
  }

  async findLatestByDossier(dossierId: string): Promise<QueueTicket | null> {
    return (
      this.rows
        .filter((row) => row.dossierId === dossierId)
        .sort((a, b) =>
          a.issuedDate === b.issuedDate ? b.ticketNumber - a.ticketNumber : b.issuedDate.localeCompare(a.issuedDate),
        )[0] ?? null
    );
  }
}
