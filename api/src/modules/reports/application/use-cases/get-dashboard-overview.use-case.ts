import { Inject, Injectable } from '@nestjs/common';
import {
  DECLARATION_REPOSITORY,
  DeclarationRepository,
} from '../../../declarations/application/ports/declaration.repository';
import { CheckpointCode } from '../../../declarations/domain/declaration.enums';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { workflowStepMetadata } from '../../../declarations/domain/workflow-step.catalog';
import { aggregateAgencyWorkload } from '../../domain/agency-workload.rules';
import { DASHBOARD_KPI_CATALOG, DashboardKpiDefinition } from '../../domain/dashboard-kpi.catalog';
import { computeTrend, dayComparisonWindows } from '../../domain/dashboard-trend.rules';
import { dossierDrilldown, gateExitDrilldown } from '../../domain/report-drilldown.rules';
import { ReportFilter, ReportScope } from '../../domain/report-filter';
import { DashboardOverviewCommand } from '../dto/run-report.command';
import {
  DashboardAlertView,
  DashboardDailyView,
  DashboardGateYardView,
  DashboardHourlyView,
  DashboardKpiView,
  DashboardOverviewView,
} from '../dto/report-view.dto';
import {
  AttentionDossierRow,
  DossierThroughputRow,
  REPORT_QUERY_REPOSITORY,
  ReportQueryCriteria,
  ReportQueryRepository,
  YardOccupancyRow,
} from '../ports/report-query.repository';
import { dossierCriteriaFromDrilldown } from '../services/dossier-report-criteria';

/** Số hồ sơ bị từ chối được nêu đích danh trên bảng cảnh báo; nhiều hơn thì gộp thành một dòng. */
const NAMED_REJECTION_LIMIT = 5;

/** Số hồ sơ chờ lâu nhất hiển thị trên panel "Cần xử lý sớm". */
const ATTENTION_LIMIT = 6;

/** Số ngày gần nhất (có phát sinh) vẽ trên biểu đồ "lưu lượng theo ngày". */
const DAILY_WINDOW = 14;

const AGENCY_DISPLAY_ORDER = ['Biên phòng', 'Hải quan', 'Kiểm dịch'];

function sortAgencies(agencies: string[]): string[] {
  return [...agencies].sort((a, b) => {
    const idxA = AGENCY_DISPLAY_ORDER.indexOf(a);
    const idxB = AGENCY_DISPLAY_ORDER.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b, 'vi');
  });
}

/**
 * Dashboard tổng quan (UI-02).
 *
 * Hai điều kiện bắt buộc của mốc M3, cả hai đều được bảo đảm **theo cấu tạo** chứ không nhờ quy ước:
 *
 * 1. **Truy ngược được.** Mỗi KPI mang sẵn `drilldown = { route, queryParams }`, và con số của nó
 *    được đếm bằng **chính `queryParams` ấy** qua `dossierCriteriaFromDrilldown`. Mở danh sách hồ
 *    sơ với bộ lọc đó thì số dòng bằng đúng con số trên thẻ.
 * 2. **Không rò rỉ theo phạm vi dữ liệu.** Mọi truy vấn đều nhận `scope` lấy từ `DossierScopeService`
 *    — cùng dịch vụ mà màn hình hồ sơ và hàng đợi liên ngành đang dùng, không có bản sao quy tắc.
 *
 * ⚠️ `alerts` **chỉ chứa cảnh báo có căn cứ dữ liệu**: hồ sơ bị từ chối, hồ sơ chờ bổ sung, lượt bị
 * chặn ở cổng, khu bãi kín chỗ. Dự án đã chốt **không có ngưỡng SLA** (điểm D5) — đừng dựng lại
 * cảnh báo quá hạn dưới bất kỳ hình thức nào.
 */
@Injectable()
export class GetDashboardOverviewUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    @Inject(REPORT_QUERY_REPOSITORY)
    private readonly reports: ReportQueryRepository,
    private readonly scopeService: DossierScopeService,
  ) {}

  async execute(command: DashboardOverviewCommand): Promise<DashboardOverviewView> {
    const now = new Date();
    const filter: ReportFilter = { from: command.from, to: command.to, checkpoint: command.checkpoint };
    const scope: ReportScope = this.scopeService.toCriteria(command.access);
    const criteria: ReportQueryCriteria = { filter, scope };

    // Xu hướng "so với hôm qua" chỉ có nghĩa khi đang xem mặc định. Người dùng chọn khoảng ngày là
    // đang soi một kỳ lịch sử cụ thể — gắn thêm "hôm nay/hôm qua" vào đó chỉ gây hiểu nhầm.
    const trendEnabled = !filter.from && !filter.to;

    const [kpis, hourly, stepStates, rejections, gateDenials, gateFlow, queueWaiting, attention, byType, throughput] =
      await Promise.all([
        Promise.all(DASHBOARD_KPI_CATALOG.map((definition) => this.buildKpi(definition, filter, scope, now, trendEnabled))),
        this.reports.findHourlyTraffic(criteria),
        this.reports.countWorkflowStepStates(criteria),
        this.reports.findRejectedDossiers(criteria, NAMED_REJECTION_LIMIT),
        this.reports.countGateDenials(criteria),
        this.reports.getGateFlowToday(scope),
        this.reports.countWaitingQueue(scope),
        this.reports.findLongestWaitingDossiers(scope, ATTENTION_LIMIT),
        this.reports.countDossiersByType(criteria),
        this.reports.findDossierThroughput(criteria),
      ]);

    // Sức chứa bãi là số liệu hạ tầng chung, không lọc theo doanh nghiệp được — chỉ đọc một lần cho
    // người dùng có phạm vi ALL, rồi dùng chung cho cả sơ đồ trạng thái lẫn cảnh báo kín chỗ.
    const yards = scope.unrestricted ? await this.reports.findYardCapacity() : [];

    return {
      generatedAt: now.toISOString(),
      kpis,
      hourly: this.toHourlySeries(hourly),
      byType: byType.map((row) => ({ type: row.type, count: row.count })),
      daily: this.toDailySeries(throughput),
      byForce: aggregateAgencyWorkload(stepStates),
      alerts: this.buildAlerts(kpis, rejections, gateDenials, yards),
      gateYard: this.buildGateYard(yards, gateFlow, queueWaiting),
      attention: this.buildAttention(attention),
    };
  }

  /**
   * Lưu lượng theo ngày: giữ N ngày **gần nhất** (rows đã sắp tăng dần theo ngày tạo). Không lấp
   * ngày trống — chỉ trình bày ngày có hồ sơ thật, tránh bịa cột 0 cho ngày không phát sinh.
   */
  private toDailySeries(rows: DossierThroughputRow[]): DashboardDailyView[] {
    return rows
      .slice(-DAILY_WINDOW)
      .map((row) => ({ date: row.date, submitted: row.submitted, completed: row.completed }));
  }

  /** Sơ đồ trạng thái cửa khẩu: tồn bãi theo khu + luồng cổng hôm nay + số đang chờ hàng đợi. */
  private buildGateYard(
    yards: YardOccupancyRow[],
    gateFlow: { passed: number; denied: number },
    queueWaiting: number,
  ): DashboardGateYardView {
    return {
      yards: yards.map((yard) => ({ yardName: yard.yardName, occupied: yard.occupied, slots: yard.slots })),
      gatePassedToday: gateFlow.passed,
      gateDeniedToday: gateFlow.denied,
      queueWaiting,
    };
  }


  /**
   * Nhãn bước lấy từ danh mục hiển thị (SG-251); nếu có nhiều bước liên ngành mở song song thì ghép
   * tên các đơn vị đang chờ (Biên phòng, Hải quan, Kiểm dịch) tương tự màn hình Xử lý liên ngành.
   */
  private buildAttention(rows: AttentionDossierRow[]): DashboardOverviewView['attention'] {
    return rows.map((row) => {
      const rawCode = row.stepCode || '';
      const stepCodes = rawCode.split(',').map((s) => s.trim()).filter(Boolean);

      let stepLabel = '';
      if (stepCodes.length === 1) {
        stepLabel = workflowStepMetadata(stepCodes[0])?.name ?? stepCodes[0];
      } else if (stepCodes.length > 1) {
        const agencies = Array.from(
          new Set(
            stepCodes
              .map((c) => workflowStepMetadata(c)?.agencyName)
              .filter((name): name is string => !!name),
          ),
        );
        if (agencies.length > 0) {
          const sortedAgencies = sortAgencies(agencies);
          stepLabel = `${sortedAgencies.join(', ')}: Kiểm tra nghiệp vụ theo chuyên ngành`;
        } else {
          stepLabel = 'Biên phòng, Hải quan, Kiểm dịch: Kiểm tra nghiệp vụ theo chuyên ngành';
        }
      } else {
        stepLabel = 'Biên phòng, Hải quan, Kiểm dịch: Kiểm tra nghiệp vụ theo chuyên ngành';
      }

      return {
        dossierId: row.dossierId,
        dossierCode: row.dossierCode,
        enterpriseName: row.enterpriseName ?? '',
        type: row.type,
        stepLabel,
        waitingSince: new Date(row.enteredAt).toISOString(),
      };
    });
  }

  /** Con số và liên kết truy ngược sinh ra từ **cùng một** bộ lọc — không có đường nào lệch nhau. */
  private async buildKpi(
    definition: DashboardKpiDefinition,
    filter: ReportFilter,
    scope: ReportScope,
    now: Date,
    trendEnabled: boolean,
  ): Promise<DashboardKpiView> {
    // KPI đo LƯỢT XE qua cổng: đếm từ gate_events, truy ngược về màn Cổng vào/ra (ngoại lệ M3).
    if (definition.source === 'GATE_EXIT') {
      return this.buildGateExitKpi(definition, filter, scope);
    }

    const drilldown = dossierDrilldown(filter, {
      status: definition.status ?? undefined,
      statusGroup: definition.statusGroup ?? undefined,
    });
    const value = await this.declarations.count(dossierCriteriaFromDrilldown(drilldown.queryParams, scope));
    const trend =
      trendEnabled && definition.trendComparable ? await this.buildTrend(definition, filter, scope, now) : undefined;
    return {
      key: definition.key,
      label: definition.label,
      value,
      unit: definition.unit,
      tone: definition.tone,
      drilldown,
      trend,
    };
  }

  /**
   * KPI "Xe đã rời cửa khẩu" — đếm **lượt xe** ra cổng (`gate_events`), scope-aware và theo kỳ.
   * Không gắn trend (số lượt qua cổng không so được theo ngày tạo hồ sơ) và truy ngược về màn Cổng.
   */
  private async buildGateExitKpi(
    definition: DashboardKpiDefinition,
    filter: ReportFilter,
    scope: ReportScope,
  ): Promise<DashboardKpiView> {
    const value = await this.reports.countGateExits({ filter, scope });
    return {
      key: definition.key,
      label: definition.label,
      value,
      unit: definition.unit,
      tone: definition.tone,
      drilldown: gateExitDrilldown(),
      trend: undefined,
    };
  }

  /**
   * Xu hướng "hôm nay so với hôm qua" theo **ngày tạo hồ sơ**, giữ nguyên bộ lọc trạng thái/chốt và
   * phạm vi dữ liệu của KPI — đếm bằng chính `declarations.count` (cùng nguồn với con số trên thẻ).
   */
  private async buildTrend(definition: DashboardKpiDefinition, filter: ReportFilter, scope: ReportScope, now: Date) {
    const windows = dayComparisonWindows(now);
    const base = {
      status: definition.status ?? undefined,
      checkpoint: filter.checkpoint as CheckpointCode | undefined,
      scope,
    };
    const [today, yesterday] = await Promise.all([
      this.declarations.count({ ...base, fromDate: windows.todayFrom, toDate: windows.todayTo }),
      this.declarations.count({ ...base, fromDate: windows.yesterdayFrom, toDate: windows.yesterdayTo }),
    ]);
    return computeTrend(today, yesterday);
  }

  /** Trả đủ 24 giờ để biểu đồ không nhảy cột khi có giờ trống. */
  private toHourlySeries(rows: Array<{ hour: number; submitted: number; passed: number }>): DashboardHourlyView[] {
    const byHour = new Map(rows.map((row) => [row.hour, row]));
    return Array.from({ length: 24 }, (_, hour) => {
      const row = byHour.get(hour);
      return {
        hour: `${String(hour).padStart(2, '0')}:00`,
        submitted: row?.submitted ?? 0,
        passed: row?.passed ?? 0,
      };
    });
  }

  private buildAlerts(
    kpis: DashboardKpiView[],
    rejections: Array<{ dossierId: string; dossierCode: string; reasonNote: string | null }>,
    gateDenials: number,
    yards: YardOccupancyRow[],
  ): DashboardAlertView[] {
    const alerts: DashboardAlertView[] = [];

    rejections.forEach((item) => {
      alerts.push({
        level: 'DANGER',
        message: item.reasonNote
          ? `Hồ sơ ${item.dossierCode} bị từ chối: ${item.reasonNote}`
          : `Hồ sơ ${item.dossierCode} bị từ chối.`,
        dossierId: item.dossierId,
        dossierCode: item.dossierCode,
      });
    });

    const rejectedTotal = this.kpiValue(kpis, 'rejected');
    if (rejectedTotal > rejections.length) {
      alerts.push({
        level: 'DANGER',
        message: `Còn ${rejectedTotal - rejections.length} hồ sơ bị từ chối khác trong kỳ.`,
      });
    }

    const needSupplement = this.kpiValue(kpis, 'needSupplement');
    if (needSupplement > 0) {
      alerts.push({ level: 'WARN', message: `${needSupplement} hồ sơ đang chờ doanh nghiệp bổ sung.` });
    }

    if (gateDenials > 0) {
      alerts.push({ level: 'WARN', message: `${gateDenials} lượt xe bị từ chối qua cổng trong kỳ.` });
    }

    // `yards` chỉ có dữ liệu với người dùng phạm vi ALL (use-case đã siết ở trên) — tài khoản doanh
    // nghiệp không được suy ra lượng xe của đơn vị khác nên danh sách rỗng, không sinh cảnh báo này.
    yards
      .filter((yard) => yard.slots > 0 && yard.occupied >= yard.slots)
      .forEach((yard) => {
        alerts.push({
          level: 'DANGER',
          message: `Khu bãi ${yard.yardName} đã kín chỗ (${yard.occupied}/${yard.slots} ô).`,
        });
      });

    return alerts;
  }

  private kpiValue(kpis: DashboardKpiView[], key: string): number {
    return kpis.find((item) => item.key === key)?.value ?? 0;
  }
}
