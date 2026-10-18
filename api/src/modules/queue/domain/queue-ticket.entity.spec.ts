import { DeclarationType } from '../../declarations/domain/declaration.enums';
import { QueueFlow, QueueTicket, flowForDossierType, toIssuedDate } from './queue-ticket.entity';

describe('flowForDossierType (F27)', () => {
  it('sang tải đi cùng luồng xuất, xe tự hành đi cùng luồng nhập', () => {
    expect(flowForDossierType(DeclarationType.EXPORT)).toBe(QueueFlow.EXIT);
    expect(flowForDossierType(DeclarationType.TRANSSHIPMENT_EXPORT)).toBe(QueueFlow.EXIT);
    expect(flowForDossierType(DeclarationType.TRANSSHIPMENT_IMPORT)).toBe(QueueFlow.ENTRY);
    expect(flowForDossierType(DeclarationType.IMPORT)).toBe(QueueFlow.ENTRY);
    expect(flowForDossierType(DeclarationType.SELF_PROPELLED)).toBe(QueueFlow.ENTRY);
  });
});

describe('toIssuedDate', () => {
  it('cắt ngày theo giờ Việt Nam (UTC+7), không theo UTC hay giờ máy chủ', () => {
    // 16:30Z = 23:30 giờ VN, vẫn trong ngày 05/07.
    expect(toIssuedDate(new Date('2026-07-05T16:30:00Z'))).toBe('2026-07-05');
    // 17:30Z = 00:30 giờ VN đã sang ngày 06/07 — cắt theo UTC sẽ nhầm còn 05/07.
    expect(toIssuedDate(new Date('2026-07-05T17:30:00Z'))).toBe('2026-07-06');
  });
});

describe('QueueTicket', () => {
  const at = new Date(2026, 6, 22, 8, 0);

  it('số mới ghi lại đúng ngày cấp, luồng và số thứ tự', () => {
    const ticket = QueueTicket.issue({
      dossierId: 'ho-so-1',
      flow: QueueFlow.ENTRY,
      checkpoint: 'B1',
      ticketNumber: 7,
      issuedById: 'user-1',
      at,
    });

    expect(ticket.issuedDate).toBe('2026-07-22');
    expect(ticket.flow).toBe(QueueFlow.ENTRY);
    expect(ticket.ticketNumber).toBe(7);
    expect(ticket.ticketCode).toBe('22/07/2026.0007');
  });

  it('cấp lại số khác khi lần ghi trước đụng ràng buộc duy nhất', () => {
    const ticket = QueueTicket.issue({
      dossierId: 'ho-so-1',
      flow: QueueFlow.ENTRY,
      checkpoint: 'B1',
      ticketNumber: 1,
      issuedById: null,
      at,
    });

    ticket.reassignNumber(2);
    expect(ticket.ticketNumber).toBe(2);
    expect(ticket.ticketCode).toBe('22/07/2026.0002');
  });
});
