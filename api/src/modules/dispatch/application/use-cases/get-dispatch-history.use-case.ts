import { Inject, Injectable } from '@nestjs/common';
import { PaginatedResult, normalizePaging, toPaginatedResult } from '../../../../common/http/pagination';
import { AUDIT_LOG_REPOSITORY, AuditLogRepository } from '../../../audit/application/ports/audit-log.repository';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../../../declarations/application/ports/declaration.repository';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { QUEUE_TICKET_REPOSITORY, QueueTicketRepository } from '../../../queue/application/ports/queue-ticket.repository';
import { YARD_REPOSITORY, YardRepository } from '../ports/yard.repository';
import { DISPATCH_AUDIT_ACTIONS } from '../../domain/dispatch-audit-action';
import { DispatchHistoryEntry, DispatchHistoryQuery, toDispatchHistoryEntry } from '../dto/dispatch-history.view';
import { AuditLog } from '../../../audit/domain/audit-log.entity';

/**
 * Tra cứu lịch sử điều phối (F33): mọi lần gán/chuyển/bỏ vị trí, kèm cán bộ thực hiện.
 *
 * Nguồn dữ liệu là nhật ký kiểm toán (`audit_logs`) lọc theo tập mã hành động `DISPATCH_*` — không
 * có bảng lịch sử riêng. Khi lọc theo đúng một hồ sơ thì kiểm quyền truy cập hồ sơ đó để chặn
 * "đoán id xem lịch sử của doanh nghiệp khác"; danh sách chung dành cho lực lượng điều phối.
 */
@Injectable()
export class GetDispatchHistoryUseCase {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly logs: AuditLogRepository,
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    @Inject(QUEUE_TICKET_REPOSITORY)
    private readonly tickets: QueueTicketRepository,
    @Inject(YARD_REPOSITORY)
    private readonly yards: YardRepository,
    private readonly scope: DossierScopeService,
  ) {}

  async execute(query: DispatchHistoryQuery): Promise<PaginatedResult<DispatchHistoryEntry>> {
    let targetId = query.dossierId;
    const targetIds: string[] = [];

    // Lọc theo mã hồ sơ hoặc biển số xe người dùng nhập: dịch mã/biển số → list targetIds.
    if (query.dossierCode) {
      const code = query.dossierCode.trim();
      let declaration = await this.declarations.findByCode(code);
      if (!declaration && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)) {
        declaration = await this.declarations.findById(code);
      }
      if (declaration) {
        this.scope.assertAccessible(declaration, query.access);
        targetId = declaration.id;
        targetIds.push(declaration.id);
        if (declaration.code && declaration.code !== declaration.id) {
          targetIds.push(declaration.code);
        }
      }

      // Tìm kiếm hồ sơ có mã hoặc biển số xe chứa chuỗi người dùng nhập (partial match theo mã hồ sơ & biển số xe)
      const matchingDeclarations = await this.declarations.findMany({
        keyword: code,
        scope: this.scope.toCriteria(query.access),
      });

      for (const d of matchingDeclarations) {
        if (!targetIds.includes(d.id)) {
          targetIds.push(d.id);
        }
        if (d.code && !targetIds.includes(d.code)) {
          targetIds.push(d.code);
        }
      }

      if (targetIds.length === 0) {
        const paging = normalizePaging(query.page, query.pageSize);
        return toPaginatedResult<DispatchHistoryEntry>([], 0, paging);
      }

      if (matchingDeclarations.length === 1 && !targetId) {
        targetId = matchingDeclarations[0].id;
      }
    } else if (query.dossierId) {
      const idOrCode = query.dossierId.trim();
      let declaration = await this.declarations.findById(idOrCode);
      if (!declaration) {
        declaration = await this.declarations.findByCode(idOrCode);
      }
      if (declaration) {
        this.scope.assertAccessible(declaration, query.access);
        targetId = declaration.id;
        targetIds.push(declaration.id);
        if (declaration.code && declaration.code !== declaration.id) {
          targetIds.push(declaration.code);
        }
      } else {
        targetId = idOrCode;
        targetIds.push(idOrCode);
      }
    }

    const page = await this.logs.findMany({
      actions: [...DISPATCH_AUDIT_ACTIONS],
      targetId,
      targetIds: targetIds.length > 1 ? targetIds : undefined,
      actor: query.actor,
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.pageSize,
    });

    const dossierIds = [...new Set(page.items.map((log) => log.targetId).filter((id): id is string => !!id))];
    const yardIds = this.extractYardIds(page.items);
    const dossierDetails = await this.resolveDossierDetails(dossierIds);
    const tickets = await this.resolveTicketSnapshots(dossierIds);
    const yardNames = await this.resolveYardNames(yardIds);
    const items = page.items.map((log) => toDispatchHistoryEntry(log, dossierDetails, tickets, yardNames));
    return toPaginatedResult(items, page.total, { page: page.page, pageSize: page.pageSize, skip: 0, take: page.pageSize });
  }

  /** Trích danh sách yardId từ nhật ký kiểm toán. */
  private extractYardIds(items: AuditLog[]): string[] {
    const ids = new Set<string>();
    for (const item of items) {
      const beforeYard = typeof item.before?.yard === 'string' ? item.before.yard : null;
      const afterYard = typeof item.after?.yard === 'string' ? item.after.yard : null;
      if (beforeYard) ids.add(beforeYard);
      if (afterYard) ids.add(afterYard);
    }
    return [...ids];
  }

  /** Bảng tra tên khu bãi cho từng `yardId` xuất hiện trong trang — để hiển thị tên thay cho id. */
  private async resolveYardNames(ids: string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    await Promise.all(
      ids.map(async (id) => {
        const yard = await this.yards.findYardById(id);
        if (yard) names.set(id, yard.name);
      }),
    );
    return names;
  }

  /** Bảng tra mã hồ sơ và biển số xe cho từng `targetId` xuất hiện trong trang. */
  private async resolveDossierDetails(ids: string[]): Promise<Map<string, { code: string; plateNumber: string | null }>> {
    const map = new Map<string, { code: string; plateNumber: string | null }>();
    await Promise.all(
      ids.map(async (id) => {
        let declaration = await this.declarations.findById(id);
        if (!declaration) {
          declaration = await this.declarations.findByCode(id);
        }
        if (declaration) {
          map.set(id, {
            code: declaration.code,
            plateNumber: declaration.vehicle?.plateNumber || null,
          });
        } else {
          map.set(id, { code: id, plateNumber: null });
        }
      }),
    );
    return map;
  }

  /** Bảng tra số thứ tự điều phối gần nhất cho từng hồ sơ trong trang (BUG-084). */
  private async resolveTicketSnapshots(
    ids: string[],
  ): Promise<Map<string, { ticketNumber: number; ticketCode: string }>> {
    const numbers = new Map<string, { ticketNumber: number; ticketCode: string }>();
    await Promise.all(
      ids.map(async (id) => {
        let ticket = await this.tickets.findLatestByDossier(id);
        if (!ticket) {
          const declaration = await this.declarations.findByCode(id);
          if (declaration) ticket = await this.tickets.findLatestByDossier(declaration.id);
        }
        if (ticket) numbers.set(id, { ticketNumber: ticket.ticketNumber, ticketCode: ticket.ticketCode });
      }),
    );
    return numbers;
  }
}
