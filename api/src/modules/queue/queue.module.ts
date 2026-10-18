import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QUEUE_TICKET_ISSUER } from '../../common/queue/dossier-queue-ticket-issuer.port';
import { DeclarationsModule } from '../declarations/declarations.module';
import { QUEUE_TICKET_REPOSITORY } from './application/ports/queue-ticket.repository';
import { IssueQueueTicketUseCase } from './application/use-cases/issue-queue-ticket.use-case';
import { DossierQueueTicketIssuerAdapter } from './infrastructure/persistence/dossier-queue-ticket-issuer.adapter';
import { QueueTicketOrmEntity } from './infrastructure/persistence/queue-ticket.orm-entity';
import { TypeOrmQueueTicketRepository } from './infrastructure/persistence/typeorm-queue-ticket.repository';
import { QueueTicketsController } from './presentation/http/queue-tickets.controller';

/**
 * Phân hệ số thứ tự phục vụ (P4 · F27).
 * Chiều phụ thuộc: `queue` → `declarations` (đọc hồ sơ, phạm vi dữ liệu). Không có chiều ngược.
 */
@Module({
  imports: [TypeOrmModule.forFeature([QueueTicketOrmEntity]), DeclarationsModule],
  controllers: [QueueTicketsController],
  providers: [
    IssueQueueTicketUseCase,
    { provide: QUEUE_TICKET_REPOSITORY, useClass: TypeOrmQueueTicketRepository },
    { provide: QUEUE_TICKET_ISSUER, useClass: DossierQueueTicketIssuerAdapter },
  ],
  // Phân hệ điều phối đọc số thứ tự gần nhất của hồ sơ để hiển thị kèm lịch sử (F33/BUG-084);
  // phân hệ cổng dùng cổng `QUEUE_TICKET_ISSUER` để tự cấp số khi xe qua cổng vào (SRS 4.1).
  exports: [QUEUE_TICKET_REPOSITORY, QUEUE_TICKET_ISSUER],
})
export class QueueModule {}
