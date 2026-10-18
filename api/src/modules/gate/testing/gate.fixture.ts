import { PaginatedResult } from '../../../common/http/pagination';
import { GateDirection } from '../../catalog/domain/border-facility.catalog';
import { GateChecklistCatalog, GateChecklistDefinition } from '../application/ports/gate-checklist.port';
import {
  GateEventPageCriteria,
  GateEventRepository,
  GateEventRow,
  GateEventSummary,
  GateEventSummaryCriteria,
} from '../application/ports/gate-event.repository';
import { GateDecision, GateEvent } from '../domain/gate-event.entity';

/** Nhật ký cổng trong bộ nhớ — KHÔNG dùng trong mã sản phẩm. */
export class InMemoryGateEventRepository implements GateEventRepository {
  readonly rows: GateEvent[] = [];

  async append(event: GateEvent): Promise<GateEvent> {
    this.rows.push(event);
    return event;
  }

  async findLatestByDossier(dossierId: string): Promise<GateEvent | null> {
    const matched = this.rows.filter((row) => row.dossierId === dossierId);
    return matched.length === 0 ? null : matched[matched.length - 1];
  }

  async findAllowedDirections(dossierId: string): Promise<GateDirection[]> {
    const dirs = this.rows
      .filter((row) => row.dossierId === dossierId && row.decision === GateDecision.ALLOW)
      .map((row) => row.direction);
    return [...new Set(dirs)];
  }

  async findPage(criteria: GateEventPageCriteria): Promise<PaginatedResult<GateEventRow>> {
    let matched = this.rows;
    if (criteria.dossierId) matched = matched.filter((row) => row.dossierId === criteria.dossierId);
    if (criteria.gateCode) matched = matched.filter((row) => row.gateCode === criteria.gateCode);
    if (criteria.direction) matched = matched.filter((row) => row.direction === criteria.direction);
    if (criteria.decision) matched = matched.filter((row) => row.decision === criteria.decision);
    if (criteria.actorName) matched = matched.filter((row) => (row.actorName || '').toLowerCase().includes(criteria.actorName!.toLowerCase()));
    if (criteria.from) matched = matched.filter((row) => row.occurredAt >= criteria.from!);
    if (criteria.to) matched = matched.filter((row) => row.occurredAt <= criteria.to!);

    const items = matched.map((event) => ({ event, dossierCode: '', plateNumber: '' }));
    return { items, total: items.length, page: 1, pageSize: items.length || 1 };
  }

  async summarizeToday(criteria: GateEventSummaryCriteria): Promise<GateEventSummary> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const matched = this.rows.filter(
      (row) =>
        row.occurredAt >= startOfDay && (!criteria.gateCode || row.gateCode === criteria.gateCode),
    );
    return {
      allowed: matched.filter((row) => row.decision === GateDecision.ALLOW).length,
      denied: matched.filter((row) => row.decision === GateDecision.DENY).length,
    };
  }
}

/**
 * Danh mục checklist cổng giả lập. Mặc định: một mục **bắt buộc** và một mục tùy chọn — đủ để
 * kiểm việc mục bắt buộc chưa tích thì chặn cho qua cổng.
 */
export class FakeGateChecklistCatalog implements GateChecklistCatalog {
  constructor(
    private readonly definitions: GateChecklistDefinition[] = [
      { code: 'CONG_HO_SO', label: 'Mã hồ sơ khớp và còn hiệu lực', required: true },
      { code: 'CONG_NIEM_PHONG', label: 'Niêm phong, kẹp chì còn nguyên vẹn', required: false },
    ],
  ) {}

  async listDefinitions(): Promise<GateChecklistDefinition[]> {
    return this.definitions;
  }
}
