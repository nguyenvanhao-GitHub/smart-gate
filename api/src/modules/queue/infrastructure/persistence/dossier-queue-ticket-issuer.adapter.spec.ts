import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { InMemoryDeclarationRepository, makeDeclaration } from '../../../declarations/testing/declaration.fixture';
import { QueueTicket, flowForDossierType, toIssuedDate } from '../../domain/queue-ticket.entity';
import { IssueQueueTicketUseCase } from '../../application/use-cases/issue-queue-ticket.use-case';
import { InMemoryQueueTicketRepository } from '../../testing/queue.fixture';
import { DossierQueueTicketIssuerAdapter } from './dossier-queue-ticket-issuer.adapter';

/**
 * Cổng `QUEUE_TICKET_ISSUER` bọc `IssueQueueTicketUseCase` — quyết định chủ dự án: xe qua cổng vào
 * thì tự cấp số thứ tự (SRS 4.1). Bộ test khoá **tính idempotent trong ngày**: chưa có số thì cấp,
 * đã có số còn hiệu lực thì tuyệt đối KHÔNG cấp thêm (tránh sinh hai số cho một lượt).
 */
describe('DossierQueueTicketIssuerAdapter (QUEUE_TICKET_ISSUER)', () => {
  const DOSSIER_ID = 'ho-so-1';
  const ACTOR_ID = 'user-nhan-vien-cong';

  function build(tickets = new InMemoryQueueTicketRepository(0)) {
    const declaration = makeDeclaration({ id: DOSSIER_ID });
    const declarations = new InMemoryDeclarationRepository([declaration]);
    const issue = new IssueQueueTicketUseCase(tickets, declarations, new DossierScopeService(new DataScopeService()));
    const spy = jest.spyOn(issue, 'execute');
    const adapter = new DossierQueueTicketIssuerAdapter(tickets, issue);
    return { adapter, tickets, issue, spy, declaration };
  }

  it('hồ sơ CHƯA có số trong ngày → cấp số mới', async () => {
    const { adapter, tickets, spy } = build();

    await adapter.ensureIssued(DOSSIER_ID, ACTOR_ID);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(tickets.rows).toHaveLength(1);
    expect(tickets.rows[0].dossierId).toBe(DOSSIER_ID);
    expect(tickets.rows[0].issuedById).toBe(ACTOR_ID);
  });

  it('hồ sơ ĐÃ có số còn hiệu lực hôm nay → KHÔNG cấp thêm', async () => {
    const tickets = new InMemoryQueueTicketRepository(0);
    const { declaration } = build(tickets);
    // Số đã cấp trong ngày hôm nay (issuedDate = hôm nay theo giờ VN).
    const existing = QueueTicket.issue({
      dossierId: DOSSIER_ID,
      flow: flowForDossierType(declaration.type),
      checkpoint: declaration.checkpoint,
      ticketNumber: 7,
      issuedById: 'quay-truoc',
    });
    await tickets.insert(existing);
    // Dựng lại adapter trên chính kho đã có số để spy đếm từ đầu.
    const { adapter, spy } = build(tickets);

    await adapter.ensureIssued(DOSSIER_ID, ACTOR_ID);

    expect(spy).not.toHaveBeenCalled();
    expect(tickets.rows).toHaveLength(1);
    expect(tickets.rows[0].ticketNumber).toBe(7);
    expect(toIssuedDate(new Date())).toBe(existing.issuedDate);
  });
});
