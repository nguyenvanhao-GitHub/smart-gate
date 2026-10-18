import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { readUniqueViolation } from '../../../../common/persistence/unique-violation';
import { QueueTicket } from '../../domain/queue-ticket.entity';
import {
  QueueTicketConflictError,
  QueueTicketRepository,
} from '../../application/ports/queue-ticket.repository';
import { QueueTicketMapper } from './queue-ticket.mapper';
import { QueueTicketOrmEntity } from './queue-ticket.orm-entity';

@Injectable()
export class TypeOrmQueueTicketRepository implements QueueTicketRepository {
  constructor(
    @InjectRepository(QueueTicketOrmEntity)
    private readonly tickets: Repository<QueueTicketOrmEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Dùng `insert` (không phải `save`) để chắc chắn sinh lệnh INSERT — `save` sẽ đổi thành UPDATE
   * khi khoá chính đã tồn tại và như vậy sẽ nuốt mất xung đột mà ta đang cần bắt.
   */
  async insert(ticket: QueueTicket): Promise<QueueTicket> {
    try {
      await this.tickets.insert(QueueTicketMapper.toPersistence(ticket));
      return ticket;
    } catch (error) {
      const conflict = this.toConflict(error);
      if (conflict) throw conflict;
      throw error;
    }
  }

  async nextNumber(issuedDate: string): Promise<number> {
    const rows: Array<{ max: number | null }> = await this.dataSource.query(
      `SELECT MAX("ticket_number")::int AS max
       FROM "queue_tickets"
       WHERE "issued_date" = $1`,
      [issuedDate],
    );
    return Number(rows[0]?.max ?? 0) + 1;
  }

  async findActiveByDossier(dossierId: string, issuedDate: string): Promise<QueueTicket | null> {
    if (!dossierId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dossierId.trim())) {
      return null;
    }
    const row = await this.tickets.findOne({ where: { dossierId: dossierId.trim(), issuedDate } });
    return row ? QueueTicketMapper.toDomain(row) : null;
  }

  async findLatestByDossier(dossierId: string): Promise<QueueTicket | null> {
    if (!dossierId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dossierId.trim())) {
      return null;
    }
    const row = await this.tickets.findOne({
      where: { dossierId: dossierId.trim() },
      order: { issuedDate: 'DESC', ticketNumber: 'DESC' },
    });
    return row ? QueueTicketMapper.toDomain(row) : null;
  }

  /** Đổi lỗi trùng chỉ mục của PostgreSQL thành lỗi nghiệp vụ mà use-case hiểu được. */
  private toConflict(error: unknown): QueueTicketConflictError | null {
    const violation = readUniqueViolation(error);
    if (!violation) return null;
    return new QueueTicketConflictError(
      violation.constraint === 'uq_queue_tickets_dossier_active' ? 'DOSSIER' : 'NUMBER',
    );
  }
}
