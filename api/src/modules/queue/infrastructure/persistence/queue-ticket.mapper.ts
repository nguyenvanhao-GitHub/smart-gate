import { QueueFlow, QueueTicket } from '../../domain/queue-ticket.entity';
import { QueueTicketOrmEntity } from './queue-ticket.orm-entity';

export class QueueTicketMapper {
  static toDomain(row: QueueTicketOrmEntity): QueueTicket {
    return new QueueTicket(
      row.id,
      row.dossierId,
      Number(row.ticketNumber),
      String(row.issuedDate),
      row.flow as QueueFlow,
      row.checkpoint,
      new Date(row.issuedAt),
      row.issuedById,
    );
  }

  static toPersistence(ticket: QueueTicket): QueueTicketOrmEntity {
    const row = new QueueTicketOrmEntity();
    row.id = ticket.id;
    row.dossierId = ticket.dossierId;
    row.ticketNumber = ticket.ticketNumber;
    row.issuedDate = ticket.issuedDate;
    row.flow = ticket.flow;
    row.checkpoint = ticket.checkpoint;
    row.issuedAt = ticket.issuedAt;
    row.issuedById = ticket.issuedById;
    return row;
  }
}
