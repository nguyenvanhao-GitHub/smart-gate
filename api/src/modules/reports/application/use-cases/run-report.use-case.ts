import { Inject, Injectable } from '@nestjs/common';
import { PaginatedResult, paginateInMemory } from '../../../../common/http/pagination';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { agencyName, workflowStepMetadata } from '../../../declarations/domain/workflow-step.catalog';
import { WorkflowDecision } from '../../../workflow/domain/workflow.enums';
import { REPORT_AGENCY_CODES } from '../../domain/agency-workload.rules';
import {
  dossierDrilldown,
  gateExitDrilldown,
  workflowQueueDrilldown,
  yardMapDrilldown,
} from '../../domain/report-drilldown.rules';
import { ReportScope } from '../../domain/report-filter';
import {
  INSPECTION_REPORT_AGENCY_CODES,
  ReportCode,
  ReportDefinition,
  findReportDefinition,
} from '../../domain/report.catalog';
import { ReportResultView } from '../dto/report-view.dto';
import { RunReportCommand } from '../dto/run-report.command';
import {
  AgencyActionStatRow,
  REPORT_QUERY_REPOSITORY,
  ReportQueryCriteria,
  ReportQueryRepository,
} from '../ports/report-query.repository';
import { appNotFound } from '../../../../common/i18n';

/** Kết quả thô của một nhánh báo cáo, trước khi bọc thành `ReportResultView`. */
interface ReportPayload {
  rows: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  summary?: Record<string, number>;
  drilldown?: ReportResultView['drilldown'];
}

const GATE_DECISION_LABELS: Record<string, string> = { ALLOW: 'Cho qua', DENY: 'Từ chối' };
const GATE_DIRECTION_LABELS: Record<string, string> = { ENTRY: 'Vào', EXIT: 'Ra' };

export function agencyInspectionStepName(agencyCode: string): string {
  switch (agencyCode) {
    case 'BORDER_GUARD':
      return 'Biên phòng kiểm tra nghiệp vụ theo chuyên ngành';
    case 'CUSTOMS':
      return 'Hải quan kiểm tra nghiệp vụ theo chuyên ngành';
    case 'QUARANTINE':
      return 'Kiểm dịch kiểm tra nghiệp vụ theo chuyên ngành';
    default:
      return `${agencyName(agencyCode)} kiểm tra nghiệp vụ theo chuyên ngành`;
  }
}

/**
 * Chạy một báo cáo trên **dữ liệu thật**.
 *
 * Ba nguyên tắc chung của mọi nhánh:
 * 1. Phạm vi dữ liệu lấy từ `DossierScopeService` và được truyền xuống tận câu truy vấn — không có
 *    nhánh nào đọc thẳng bảng mà bỏ qua `scope`.
 * 2. Báo cáo nào quy được về danh sách hồ sơ thì trả `drilldown` + `summary.dossiers`; hai thứ đó
 *    phải khớp nhau, vì con số được đếm bằng chính `drilldown.queryParams`.
 * 3. Lọc theo lực lượng được suy từ **mã bước** (`workflow-step.catalog`) chứ không tin cột
 *    `agency_code` — cột đó cho phép null với dữ liệu cũ.
 */
@Injectable()
export class RunReportUseCase {
  constructor(
    @Inject(REPORT_QUERY_REPOSITORY)
    private readonly reports: ReportQueryRepository,
    private readonly scopeService: DossierScopeService,
  ) {}

  async execute(command: RunReportCommand): Promise<ReportResultView> {
    const definition = findReportDefinition(command.code);
    if (!definition) {
      throw appNotFound('report.notFound', { code: command.code });
    }

    const scope: ReportScope = this.scopeService.toCriteria(command.access);
    const criteria: ReportQueryCriteria = { filter: command.filter, scope };
    const payload = await this.runReport(definition, criteria, command);

    return {
      code: definition.code,
      name: definition.name,
      generatedAt: new Date().toISOString(),
      columns: definition.columns,
      ...payload,
    };
  }

  private runReport(
    definition: ReportDefinition,
    criteria: ReportQueryCriteria,
    command: RunReportCommand,
  ): Promise<ReportPayload> {
    switch (definition.code) {
      case ReportCode.DOSSIER_THROUGHPUT:
        return this.dossierThroughput(criteria, command);
      case ReportCode.AGENCY_PROCESSING_TIME:
        return this.agencyProcessingTime(criteria, command);
      case ReportCode.AGENCY_DECISION:
        return this.agencyDecision(criteria, command);
      case ReportCode.GATE_EVENT:
        return this.gateEvents(criteria, command);
      default:
        return this.yardOccupancy(criteria, command);
    }
  }

  // ---------------------------------------------------------------- Hồ sơ

  private async dossierThroughput(criteria: ReportQueryCriteria, command: RunReportCommand): Promise<ReportPayload> {
    const source = await this.reports.findDossierThroughput(criteria);
    const rows = source.map((row) => ({
      date: row.date,
      total: row.total,
      submitted: row.submitted,
      completed: row.completed,
      rejected: row.rejected,
    }));
    const sum = (key: 'total' | 'submitted' | 'completed' | 'rejected'): number =>
      rows.reduce((acc, row) => acc + row[key], 0);

    return {
      ...this.toPayload(paginateInMemory(rows, command.page, command.pageSize)),
      summary: {
        // `dossiers` là con số đối chiếu với drill-down: tổng hồ sơ tạo trong kỳ theo bộ lọc.
        dossiers: sum('total'),
        submitted: sum('submitted'),
        completed: sum('completed'),
        rejected: sum('rejected'),
      },
      drilldown: dossierDrilldown(criteria.filter),
    };
  }

  // ---------------------------------------------------------------- Liên ngành

  private async agencyProcessingTime(
    criteria: ReportQueryCriteria,
    command: RunReportCommand,
  ): Promise<ReportPayload> {
    const stats = this.filterByAgency(await this.reports.findAgencyActionStats(criteria), criteria);

    const targetAgencies = INSPECTION_REPORT_AGENCY_CODES.filter(
      (code) => !criteria.filter.agencyCode || criteria.filter.agencyCode === code,
    );

    const rows = targetAgencies.map((agencyCode) => {
      const own = stats.filter((row) => workflowStepMetadata(row.stepCode)?.agencyCode === agencyCode);
      const actions = own.reduce((acc, row) => acc + row.actions, 0);
      const totalSeconds = own.reduce((acc, row) => acc + row.totalSeconds, 0);
      const maxSeconds = own.reduce((acc, row) => Math.max(acc, row.maxSeconds), 0);

      return {
        agencyCode,
        agencyName: agencyName(agencyCode),
        stepName: agencyInspectionStepName(agencyCode),
        actions,
        averageSeconds: actions ? Math.round(totalSeconds / actions) : 0,
        maxSeconds,
      };
    });

    const actions = rows.reduce((acc, row) => acc + row.actions, 0);
    const totalSeconds = stats.reduce((acc, row) => acc + row.totalSeconds, 0);

    return {
      ...this.toPayload(paginateInMemory(rows, command.page, command.pageSize)),
      summary: { actions, averageSeconds: actions ? Math.round(totalSeconds / actions) : 0 },
      drilldown: workflowQueueDrilldown(),
    };
  }

  private async agencyDecision(criteria: ReportQueryCriteria, command: RunReportCommand): Promise<ReportPayload> {
    const stats = this.filterByAgency(await this.reports.findAgencyActionStats(criteria), criteria);

    const rows = REPORT_AGENCY_CODES.filter(
      (code) => !criteria.filter.agencyCode || criteria.filter.agencyCode === code,
    ).map((agencyCode) => {
      const own = stats.filter((row) => workflowStepMetadata(row.stepCode)?.agencyCode === agencyCode);
      const count = (decision: WorkflowDecision): number =>
        own.filter((row) => row.decision === decision).reduce((acc, row) => acc + row.actions, 0);

      const approve = count(WorkflowDecision.APPROVE);
      const requestSupplement = count(WorkflowDecision.REQUEST_SUPPLEMENT);
      const reject = count(WorkflowDecision.REJECT);

      return {
        agencyCode,
        agencyName: agencyName(agencyCode),
        approve,
        requestSupplement,
        reject,
        total: approve + requestSupplement + reject,
      };
    });

    return {
      ...this.toPayload(paginateInMemory(rows, command.page, command.pageSize)),
      summary: { actions: rows.reduce((acc, row) => acc + row.total, 0) },
      drilldown: workflowQueueDrilldown(),
    };
  }

  /** Lọc theo lực lượng dựa trên **mã bước**, vì cột `agency_code` có thể null ở dữ liệu cũ. */
  private filterByAgency(stats: AgencyActionStatRow[], criteria: ReportQueryCriteria): AgencyActionStatRow[] {
    const agencyCode = criteria.filter.agencyCode;
    if (!agencyCode) return stats;
    return stats.filter((row) => workflowStepMetadata(row.stepCode)?.agencyCode === agencyCode);
  }

  // ---------------------------------------------------------------- Cổng và kho bãi

  private async gateEvents(criteria: ReportQueryCriteria, command: RunReportCommand): Promise<ReportPayload> {
    const page = await this.reports.findGateEvents({ ...criteria, page: command.page, pageSize: command.pageSize });
    const entryAllow = page.actionStats?.entryAllow ?? 0;
    const entryDeny = page.actionStats?.entryDeny ?? 0;
    const exitAllow = page.actionStats?.exitAllow ?? 0;
    const exitDeny = page.actionStats?.exitDeny ?? 0;
    const totalActions = entryAllow + entryDeny + exitAllow + exitDeny;

    return {
      rows: page.items.map((item) => ({
        occurredAt: item.occurredAt.toISOString(),
        dossierId: item.dossierId ?? '',
        dossierCode: item.dossierCode ?? '',
        plateNumber: item.plateNumber,
        gateCode: item.gateCode,
        direction: GATE_DIRECTION_LABELS[item.direction] ?? item.direction,
        decision: GATE_DECISION_LABELS[item.decision] ?? item.decision,
        statusColor: item.statusColor,
        actorName: item.actorName ?? '',
        note: item.note ?? '',
      })),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      summary: {
        events: page.actionStats ? totalActions : page.total,
        entryAllow,
        entryDeny,
        exitAllow,
        exitDeny,
      },
      drilldown: gateExitDrilldown(criteria.filter),
    };
  }

  private async yardOccupancy(criteria: ReportQueryCriteria, command: RunReportCommand): Promise<ReportPayload> {
    const source = await this.reports.findYardOccupancy(criteria);
    const rows = source.map((row) => ({
      yardCode: row.yardCode,
      yardName: row.yardName,
      capacity: row.capacity,
      slots: row.slots,
      occupied: row.occupied,
      available: Math.max(0, row.slots - row.occupied),
    }));

    return {
      ...this.toPayload(paginateInMemory(rows, command.page, command.pageSize)),
      summary: {
        slots: rows.reduce((acc, row) => acc + row.slots, 0),
        occupied: rows.reduce((acc, row) => acc + row.occupied, 0),
        available: rows.reduce((acc, row) => acc + row.available, 0),
      },
      drilldown: yardMapDrilldown(),
    };
  }

  // ---------------------------------------------------------------- Tiện ích

  private toPayload(page: PaginatedResult<Record<string, unknown>>): ReportPayload {
    return { rows: page.items, total: page.total, page: page.page, pageSize: page.pageSize };
  }
}
