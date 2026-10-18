import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { CheckpointCode, DeclarationStatus, DeclarationType } from '../../../declarations/domain/declaration.enums';
import { InMemoryDeclarationRepository, makeAccess, makeDeclaration } from '../../../declarations/testing/declaration.fixture';
import { QueueFlow } from '../../domain/queue-ticket.entity';
import { InMemoryQueueTicketRepository } from '../../testing/queue.fixture';
import { IssueQueueTicketUseCase } from './issue-queue-ticket.use-case';

const staff = makeAccess({
  userId: 'user-dieu-phoi',
  roles: [{ code: 'DISPATCHER', name: 'Điều phối viên', dataScope: DataScopeLevel.ALL }],
  permissions: ['queue.create', 'queue.view'],
});

function build(yieldTimes = 2, ...declarations: ReturnType<typeof makeDeclaration>[]) {
  const tickets = new InMemoryQueueTicketRepository(yieldTimes);
  const dossiers = new InMemoryDeclarationRepository(declarations);
  const useCase = new IssueQueueTicketUseCase(tickets, dossiers, new DossierScopeService(new DataScopeService()));
  return { tickets, dossiers, useCase };
}

describe('IssueQueueTicketUseCase (F27)', () => {
  it('cấp số bắt đầu từ 1 và gắn đúng luồng của hồ sơ', async () => {
    const dossier = makeDeclaration({ id: 'ho-so-nhap', type: DeclarationType.IMPORT, checkpoint: CheckpointCode.B1 });
    const { useCase } = build(0, dossier);

    const { ticket, created } = await useCase.execute({ dossierId: 'ho-so-nhap', actorId: staff.userId, access: staff });

    expect(ticket.ticketNumber).toBe(1);
    expect(ticket.ticketCode).toMatch(/^\d{2}\/\d{2}\/\d{4}\.0001$/);
    expect(ticket.flow).toBe(QueueFlow.ENTRY);
    expect(ticket.checkpoint).toBe(CheckpointCode.B1);
    // BUG-070: cấp số mới là 201 (created = true).
    expect(created).toBe(true);
  });

  it('hồ sơ xuất khẩu và nhập khẩu được cấp số tự tăng liên tục trong ngày', async () => {
    const xuat = makeDeclaration({ id: 'ho-so-xuat', type: DeclarationType.EXPORT, checkpoint: CheckpointCode.B1 });
    const nhap = makeDeclaration({ id: 'ho-so-nhap', type: DeclarationType.IMPORT, checkpoint: CheckpointCode.B1 });
    const { useCase } = build(0, xuat, nhap);

    const { ticket: a } = await useCase.execute({ dossierId: 'ho-so-xuat', actorId: staff.userId, access: staff });
    const { ticket: b } = await useCase.execute({ dossierId: 'ho-so-nhap', actorId: staff.userId, access: staff });

    expect(a.flow).toBe(QueueFlow.EXIT);
    expect(b.flow).toBe(QueueFlow.ENTRY);
    // Số thứ tự chạy liên tục trong ngày cho mọi loại hồ sơ (1, 2)
    expect(a.ticketNumber).toBe(1);
    expect(b.ticketNumber).toBe(2);
  });

  /**
   * HỒI QUY BUG-017: hai hồ sơ cùng luồng nhưng **khác cửa khẩu** phải nhận số khác nhau. Trước đây
   * dãy số đánh riêng theo cửa khẩu nên cả hai cùng nhận số 1 và bảng điều phối không phân biệt được.
   */
  it('hai hồ sơ cùng luồng nhưng khác cửa khẩu vẫn nhận số khác nhau', async () => {
    const a = makeDeclaration({ id: 'ho-so-b1', type: DeclarationType.IMPORT, checkpoint: CheckpointCode.B1 });
    const b = makeDeclaration({ id: 'ho-so-b2', type: DeclarationType.IMPORT, checkpoint: CheckpointCode.B2 });
    const { useCase } = build(0, a, b);

    const { ticket: first } = await useCase.execute({ dossierId: 'ho-so-b1', actorId: staff.userId, access: staff });
    const { ticket: second } = await useCase.execute({ dossierId: 'ho-so-b2', actorId: staff.userId, access: staff });

    expect(first.flow).toBe(QueueFlow.ENTRY);
    expect(second.flow).toBe(QueueFlow.ENTRY);
    // Cùng luồng ENTRY: số chạy chung, không lặp theo cửa khẩu.
    expect([first.ticketNumber, second.ticketNumber].sort((left, right) => left - right)).toEqual([1, 2]);
  });

  /**
   * ĐIỀU KIỆN NGHIỆM THU: hai yêu cầu **đồng thời** không được cấp trùng số.
   * Kho giả lập nhường lượt trong `nextNumber()` nên cả hai cùng đọc ra số 1 — chỉ ràng buộc duy
   * nhất lúc ghi mới tách được chúng ra.
   */
  it('hai yêu cầu đồng thời không bao giờ nhận cùng một số', async () => {
    const dossiers = Array.from({ length: 6 }, (_, index) =>
      makeDeclaration({ id: `ho-so-${index}`, type: DeclarationType.IMPORT, checkpoint: CheckpointCode.B1 }),
    );
    const { useCase } = build(2, ...dossiers);

    const results = await Promise.all(
      dossiers.map((dossier) => useCase.execute({ dossierId: dossier.id, actorId: staff.userId, access: staff })),
    );

    const numbers = results.map((item) => item.ticket.ticketNumber).sort((left, right) => left - right);
    expect(new Set(numbers).size).toBe(dossiers.length);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('cấp lại cho cùng hồ sơ trong ngày trả đúng số cũ, không sinh số thứ hai', async () => {
    const dossier = makeDeclaration({ id: 'ho-so-nhap', type: DeclarationType.IMPORT });
    const { useCase, tickets } = build(0, dossier);

    const first = await useCase.execute({ dossierId: 'ho-so-nhap', actorId: staff.userId, access: staff });
    const second = await useCase.execute({ dossierId: 'ho-so-nhap', actorId: staff.userId, access: staff });

    expect(second.ticket.id).toBe(first.ticket.id);
    expect(second.ticket.ticketNumber).toBe(first.ticket.ticketNumber);
    expect(tickets.rows).toHaveLength(1);
    // BUG-070: lần đầu sinh số mới (201), lần hai trả số cũ nên KHÔNG tạo mới → 200.
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
  });

  it('hồ sơ nháp hoặc đã hủy thì không cấp số', async () => {
    const nhap = makeDeclaration({ id: 'nhap-nhap', status: DeclarationStatus.DRAFT });
    const huy = makeDeclaration({ id: 'da-huy', status: DeclarationStatus.CANCELLED });
    const { useCase } = build(0, nhap, huy);

    await expect(useCase.execute({ dossierId: 'nhap-nhap', actorId: staff.userId, access: staff })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(useCase.execute({ dossierId: 'da-huy', actorId: staff.userId, access: staff })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('không tìm thấy hồ sơ thì báo 404 bằng tiếng Việt', async () => {
    const { useCase } = build(0);
    await expect(
      useCase.execute({ dossierId: 'khong-ton-tai', actorId: staff.userId, access: staff }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
