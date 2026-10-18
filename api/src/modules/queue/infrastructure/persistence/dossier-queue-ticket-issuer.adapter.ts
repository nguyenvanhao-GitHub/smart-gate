import { Inject, Injectable, Logger } from '@nestjs/common';
import { SYSTEM_ACCESS_CONTEXT } from '../../../../common/auth/access-context';
import { DossierQueueTicketIssuer } from '../../../../common/queue/dossier-queue-ticket-issuer.port';
import { toIssuedDate } from '../../domain/queue-ticket.entity';
import { IssueQueueTicketUseCase } from '../../application/use-cases/issue-queue-ticket.use-case';
import { QUEUE_TICKET_REPOSITORY, QueueTicketRepository } from '../../application/ports/queue-ticket.repository';

/**
 * Hiện thực cổng `QUEUE_TICKET_ISSUER` — **bọc** `IssueQueueTicketUseCase` để tự cấp số khi xe qua
 * cổng vào (quyết định chủ dự án). Đặt ở phân hệ hàng đợi, đúng nếp `DossierFeeCalculatorAdapter`:
 * chiều phụ thuộc mô-đun là `gate` → `queue`, nên cổng cho `gate` gọi vào được đặt tại `queue`.
 *
 * **Idempotent**: đọc `queue_tickets` của hồ sơ trong ngày trước; đã có số còn hiệu lực thì trả về
 * ngay, KHÔNG cấp thêm. `IssueQueueTicketUseCase` cũng tự chống trùng (đọc lại + unique index) nên
 * pre-check này chỉ để tránh gọi use-case khi không cần. Chạy dưới ngữ cảnh hệ thống
 * (`SYSTEM_ACCESS_CONTEXT`, phạm vi ALL) vì đây là thao tác nội bộ; `actorId` (nhân viên cổng) vẫn
 * được ghi vào `issued_by` để biết ai kích hoạt.
 */
@Injectable()
export class DossierQueueTicketIssuerAdapter implements DossierQueueTicketIssuer {
  private readonly logger = new Logger(DossierQueueTicketIssuerAdapter.name);

  constructor(
    @Inject(QUEUE_TICKET_REPOSITORY)
    private readonly tickets: QueueTicketRepository,
    private readonly issue: IssueQueueTicketUseCase,
  ) {}

  async ensureIssued(dossierId: string, actorId: string): Promise<void> {
    const issuedDate = toIssuedDate(new Date());
    // Đã có số còn hiệu lực trong ngày → tôn trọng số đã cấp, không cấp thêm.
    const existing = await this.tickets.findActiveByDossier(dossierId, issuedDate);
    if (existing) return;

    await this.issue.execute({ dossierId, actorId, access: SYSTEM_ACCESS_CONTEXT });
    this.logger.log(`Đã tự cấp số thứ tự cho hồ sơ ${dossierId} khi xe qua cổng vào.`);
  }
}
