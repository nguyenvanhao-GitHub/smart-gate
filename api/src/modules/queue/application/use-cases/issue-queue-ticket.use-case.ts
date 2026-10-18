import { Inject, Injectable } from '@nestjs/common';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../../../declarations/application/ports/declaration.repository';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { Declaration } from '../../../declarations/domain/declaration.entity';
import { DeclarationStatus } from '../../../declarations/domain/declaration.enums';
import { QueueTicket, flowForDossierType, toIssuedDate } from '../../domain/queue-ticket.entity';
import { IssueQueueTicketCommand } from '../dto/issue-queue-ticket.command';
import { QueueTicketView, toQueueTicketView } from '../dto/queue-ticket-view.dto';
import {
  QUEUE_TICKET_REPOSITORY,
  QueueTicketConflictError,
  QueueTicketRepository,
} from '../ports/queue-ticket.repository';
import { appBadRequest, appNotFound, appConflict } from '../../../../common/i18n';

/**
 * Số lần thử lại khi nhiều quầy cùng cấp số một lúc. Mỗi lần đụng nhau chỉ mất một vòng đọc số
 * lớn nhất, nên để rộng tay; vượt ngưỡng này là dấu hiệu bất thường và phải báo ra, không im lặng.
 */
const MAX_ATTEMPTS = 10;

/** Hồ sơ ở các trạng thái này thì không có gì để xếp hàng. */
const NOT_ISSUABLE: DeclarationStatus[] = [
  DeclarationStatus.DRAFT,
  DeclarationStatus.CANCELLED,
  DeclarationStatus.REJECTED,
];

/**
 * Kết quả cấp số. `created` = true khi vừa sinh số mới (HTTP 201); false khi trả lại số đã cấp trước
 * đó trong ngày (thao tác idempotent → HTTP 200, không tạo bản ghi mới — BUG-070).
 */
export interface IssueQueueTicketResult {
  ticket: QueueTicketView;
  created: boolean;
}

/**
 * Cấp số thứ tự cho hồ sơ (F27).
 *
 * Cách chống trùng số: **ghi rồi bắt lỗi**, không phải kiểm-rồi-ghi. `nextNumber()` chỉ là gợi ý;
 * nếu một yêu cầu khác giành mất số đó thì database ném lỗi trùng chỉ mục, ta lấy số kế tiếp và
 * thử lại. Đây là lý do ràng buộc duy nhất bắt buộc phải nằm ở tầng database.
 */
@Injectable()
export class IssueQueueTicketUseCase {
  constructor(
    @Inject(QUEUE_TICKET_REPOSITORY)
    private readonly tickets: QueueTicketRepository,
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    private readonly scope: DossierScopeService,
  ) {}

  async execute(command: IssueQueueTicketCommand): Promise<IssueQueueTicketResult> {
    const declaration = await this.declarations.findById(command.dossierId);
    if (!declaration) throw appNotFound('queue.dossierNotFound');
    this.scope.assertAccessible(declaration, command.access);

    if (NOT_ISSUABLE.includes(declaration.status)) {
      throw appBadRequest('queue.dossierNotSubmitted');
    }

    const issuedDate = toIssuedDate(new Date());
    const flow = flowForDossierType(declaration.type);
    const checkpoint = declaration.checkpoint;

    // Cấp lại lần hai cho cùng hồ sơ trong ngày thì trả đúng số cũ — quầy bấm nhầm hai lần
    // không được sinh ra hai số.
    const existing = await this.tickets.findActiveByDossier(declaration.id, issuedDate);
    if (existing) return { ticket: this.toView(existing, declaration), created: false };

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      // Số chạy theo ngày — KHÔNG theo luồng hay cửa khẩu. `checkpoint` vẫn được lưu để biết thẻ thuộc chốt nào.
      const ticketNumber = await this.tickets.nextNumber(issuedDate);
      const ticket = QueueTicket.issue({
        dossierId: declaration.id,
        flow,
        checkpoint,
        ticketNumber,
        issuedById: command.actorId,
      });

      try {
        const saved = await this.tickets.insert(ticket);
        return { ticket: this.toView(saved, declaration), created: true };
      } catch (error) {
        if (!(error instanceof QueueTicketConflictError)) throw error;
        if (error.scope === 'DOSSIER') {
          const taken = await this.tickets.findActiveByDossier(declaration.id, issuedDate);
          if (taken) return { ticket: this.toView(taken, declaration), created: false };
        }
        // Trùng số: vòng lặp sau sẽ đọc lại số lớn nhất và thử tiếp.
      }
    }

    throw appConflict('queue.conflict');
  }

  private toView(ticket: QueueTicket, declaration: Declaration): QueueTicketView {
    return toQueueTicketView({
      ticket,
      dossierCode: declaration.code,
      plateNumber: declaration.vehicle?.plateNumber ?? '',
      enterpriseName: declaration.enterprise?.name ?? '',
    });
  }
}
