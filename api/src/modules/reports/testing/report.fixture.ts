import { AuditEntryInput, AuditLogger } from '../../../common/audit/audit-logger.port';
import { PaginatedResult, normalizePaging, toPaginatedResult } from '../../../common/http/pagination';
import {
  DeclarationPageCriteria,
  DeclarationScopeCriteria,
  DeclarationSearchCriteria,
} from '../../declarations/application/ports/declaration.repository';
import { Declaration } from '../../declarations/domain/declaration.entity';
import { InMemoryDeclarationRepository } from '../../declarations/testing/declaration.fixture';
import { WorkflowStepStatusCount } from '../domain/agency-workload.rules';
import {
  AgencyActionStatRow,
  AttentionDossierRow,
  DossierThroughputRow,
  DossierTypeCountRow,
  GateActionStats,
  GateEventReportRow,
  GateFlowToday,
  HourlyTrafficRow,
  RejectedDossierRow,
  ReportPageQueryCriteria,
  ReportQueryRepository,
  YardOccupancyRow,
} from '../application/ports/report-query.repository';
import { ReportScope } from '../domain/report-filter';

/**
 * Bộ dữ liệu dựng sẵn cho test của phân hệ báo cáo — KHÔNG dùng trong mã sản phẩm.
 */

/**
 * Kho hồ sơ trong bộ nhớ **có lọc thật**.
 *
 * `InMemoryDeclarationRepository` gốc trả về mọi bản ghi bất kể điều kiện, nên không dùng được để
 * chứng minh "KPI khớp danh sách nguồn". Lớp này lặp lại đúng các điều kiện của
 * `TypeOrmDeclarationRepository.buildQuery` cho những trường mà báo cáo dùng tới, và quan trọng
 * nhất: `count` và `findPage` **dùng chung một hàm lọc**, y như kho dữ liệu thật dùng chung
 * `buildQuery`.
 */
export class FilteringDeclarationRepository extends InMemoryDeclarationRepository {
  async findMany(criteria: DeclarationSearchCriteria): Promise<Declaration[]> {
    return this.applyFilter(criteria);
  }

  async count(criteria: DeclarationSearchCriteria): Promise<number> {
    return this.applyFilter(criteria).length;
  }

  async findPage(criteria: DeclarationPageCriteria): Promise<PaginatedResult<Declaration>> {
    const matched = this.applyFilter(criteria);
    const paging = normalizePaging(criteria.page, criteria.pageSize);
    return toPaginatedResult(matched.slice(paging.skip, paging.skip + paging.take), matched.length, paging);
  }

  private applyFilter(criteria: DeclarationSearchCriteria): Declaration[] {
    return [...this.rows.values()]
      .filter((item) => !criteria.type || item.type === criteria.type)
      .filter((item) => !criteria.status || item.status === criteria.status)
      .filter((item) => !criteria.statuses?.length || criteria.statuses.includes(item.status))
      .filter((item) => !criteria.checkpoint || item.checkpoint === criteria.checkpoint)
      .filter((item) => !criteria.fromDate || item.createdAt >= criteria.fromDate)
      .filter((item) => !criteria.toDate || item.createdAt <= criteria.toDate)
      .filter((item) => this.matchesScope(item, criteria.scope))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  private matchesScope(item: Declaration, scope?: DeclarationScopeCriteria): boolean {
    if (!scope || scope.unrestricted) return true;
    const taxCodes = scope.taxCodes ?? [];
    if (taxCodes.length > 0) {
      const taxCode = item.enterprise?.taxCode;
      return !!taxCode && taxCodes.includes(taxCode);
    }
    return !!item.createdById && item.createdById === scope.ownerUserId;
  }
}

export interface FakeReportData {
  hourly?: HourlyTrafficRow[];
  stepStates?: WorkflowStepStatusCount[];
  throughput?: DossierThroughputRow[];
  byType?: DossierTypeCountRow[];
  actionStats?: AgencyActionStatRow[];
  gateEvents?: GateEventReportRow[];
  yardOccupancy?: YardOccupancyRow[];
  rejections?: RejectedDossierRow[];
  gateDenials?: number;
  gateExits?: number;
  yardCapacity?: YardOccupancyRow[];
  gateFlowToday?: GateFlowToday;
  queueWaiting?: number;
  attention?: AttentionDossierRow[];
}

/** Kho truy vấn tổng hợp giả lập. Ghi lại `scope` của lần gọi cuối để test kiểm phạm vi dữ liệu. */
export class FakeReportQueryRepository implements ReportQueryRepository {
  readonly seenScopes: Array<{ method: string; scope: unknown; criteria?: unknown }> = [];

  constructor(private readonly data: FakeReportData = {}) {}

  async findHourlyTraffic(criteria: ReportPageQueryCriteria): Promise<HourlyTrafficRow[]> {
    this.record('findHourlyTraffic', criteria);
    return this.data.hourly ?? [];
  }

  async countWorkflowStepStates(criteria: ReportPageQueryCriteria): Promise<WorkflowStepStatusCount[]> {
    this.record('countWorkflowStepStates', criteria);
    return this.data.stepStates ?? [];
  }

  async findDossierThroughput(criteria: ReportPageQueryCriteria): Promise<DossierThroughputRow[]> {
    this.record('findDossierThroughput', criteria);
    return this.data.throughput ?? [];
  }

  async countDossiersByType(criteria: ReportPageQueryCriteria): Promise<DossierTypeCountRow[]> {
    this.record('countDossiersByType', criteria);
    return this.data.byType ?? [];
  }

  async findAgencyActionStats(criteria: ReportPageQueryCriteria): Promise<AgencyActionStatRow[]> {
    this.record('findAgencyActionStats', criteria);
    return this.data.actionStats ?? [];
  }

  async findGateEvents(
    criteria: ReportPageQueryCriteria,
  ): Promise<PaginatedResult<GateEventReportRow> & { actionStats?: GateActionStats }> {
    this.record('findGateEvents', criteria);
    const rows = this.data.gateEvents ?? [];
    const paging = normalizePaging(criteria.page, criteria.pageSize);
    const result = toPaginatedResult(rows.slice(paging.skip, paging.skip + paging.take), rows.length, paging);
    const actionStats: GateActionStats = {
      entryAllow: rows.filter((r) => r.direction === 'ENTRY' && r.decision === 'ALLOW').length,
      entryDeny: rows.filter((r) => r.direction === 'ENTRY' && r.decision === 'DENY').length,
      exitAllow: rows.filter((r) => r.direction === 'EXIT' && r.decision === 'ALLOW').length,
      exitDeny: rows.filter((r) => r.direction === 'EXIT' && r.decision === 'DENY').length,
    };
    return Object.assign(result, { actionStats });
  }

  async findYardOccupancy(criteria: ReportPageQueryCriteria): Promise<YardOccupancyRow[]> {
    this.record('findYardOccupancy', criteria);
    return this.data.yardOccupancy ?? [];
  }

  async findRejectedDossiers(criteria: ReportPageQueryCriteria, limit: number): Promise<RejectedDossierRow[]> {
    this.record('findRejectedDossiers', criteria);
    return (this.data.rejections ?? []).slice(0, limit);
  }

  async countGateDenials(criteria: ReportPageQueryCriteria): Promise<number> {
    this.record('countGateDenials', criteria);
    return this.data.gateDenials ?? 0;
  }

  async countGateExits(criteria: ReportPageQueryCriteria): Promise<number> {
    this.record('countGateExits', criteria);
    return this.data.gateExits ?? 0;
  }

  async findYardCapacity(): Promise<YardOccupancyRow[]> {
    this.seenScopes.push({ method: 'findYardCapacity', scope: null });
    return this.data.yardCapacity ?? [];
  }

  async getGateFlowToday(scope: ReportScope): Promise<GateFlowToday> {
    this.seenScopes.push({ method: 'getGateFlowToday', scope });
    return this.data.gateFlowToday ?? { passed: 0, denied: 0 };
  }

  async countWaitingQueue(scope: ReportScope): Promise<number> {
    this.seenScopes.push({ method: 'countWaitingQueue', scope });
    return this.data.queueWaiting ?? 0;
  }

  async findLongestWaitingDossiers(scope: ReportScope, limit: number): Promise<AttentionDossierRow[]> {
    this.seenScopes.push({ method: 'findLongestWaitingDossiers', scope });
    return (this.data.attention ?? []).slice(0, limit);
  }

  private record(method: string, criteria: { scope: unknown }): void {
    this.seenScopes.push({ method, scope: criteria.scope, criteria });
  }
}

/** Nhật ký kiểm toán giả lập — giữ lại mọi bản ghi để test đối chiếu. */
export class RecordingAuditLogger implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];

  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}
