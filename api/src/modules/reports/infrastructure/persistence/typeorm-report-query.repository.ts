import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PaginatedResult, normalizePaging, toPaginatedResult } from '../../../../common/http/pagination';
import { vietnamDateString } from '../../../../common/time/vietnam-date';
import { DeclarationStatus } from '../../../declarations/domain/declaration.enums';
import { WorkflowStepStatusCount } from '../../domain/agency-workload.rules';
import { ReportFilter, ReportScope, parseFilterEndDate, parseFilterStartDate } from '../../domain/report-filter';
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
  ReportQueryCriteria,
  ReportQueryRepository,
  YardOccupancyRow,
} from '../../application/ports/report-query.repository';

/** Hàm đăng ký tham số cho câu SQL đang dựng. Trả về chuỗi `$n` để ghép vào câu lệnh. */
type ParamBinder = (value: unknown) => string;

/**
 * Truy vấn tổng hợp cho báo cáo và dashboard.
 *
 * Vì sao viết SQL thô thay vì QueryBuilder: mọi truy vấn ở đây đều là **gộp nhóm nhiều bảng**
 * (`FILTER (WHERE …)`, `EXTRACT`, `LATERAL`) mà QueryBuilder diễn tả rất vụng. Đổi lại, mỗi câu
 * lệnh phải tự lo hai việc:
 *
 * 1. **Phạm vi dữ liệu** — mọi câu đều đi qua `scopeCondition`, đúng cùng một quy tắc với
 *    `TypeOrmDeclarationRepository.applyScope` và `TypeOrmWorkflowInstanceRepository.scopeCondition`.
 *    Bảng con luôn được nối ngược về `declarations` rồi mới lọc, không có bảng nào đọc trực tiếp.
 * 2. **Tham số hóa** — không nối chuỗi giá trị vào SQL; `ParamBinder` sinh `$1, $2…`.
 *
 * ⚠️ Ngày tháng: `from`/`to` được so **đúng như màn hình danh sách hồ sơ** (`>= from`, `<= to`,
 * không tự nới `to` thành cuối ngày). Nới ở đây sẽ làm số trên báo cáo lệch số dòng khi bấm mở
 * danh sách nguồn.
 */
@Injectable()
export class TypeOrmReportQueryRepository implements ReportQueryRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------- Dashboard

  async findHourlyTraffic(criteria: ReportQueryCriteria): Promise<HourlyTrafficRow[]> {
    const submitted = await this.querySubmittedByHour(criteria);
    const passed = await this.queryPassedByHour(criteria);

    const merged = new Map<number, HourlyTrafficRow>();
    submitted.forEach((row) => merged.set(row.hour, { hour: row.hour, submitted: row.total, passed: 0 }));
    passed.forEach((row) => {
      const current = merged.get(row.hour) ?? { hour: row.hour, submitted: 0, passed: 0 };
      current.passed = row.total;
      merged.set(row.hour, current);
    });
    return [...merged.values()].sort((left, right) => left.hour - right.hour);
  }

  private async querySubmittedByHour(criteria: ReportQueryCriteria): Promise<Array<{ hour: number; total: number }>> {
    const params: unknown[] = [];
    const p = this.binder(params);
    const conditions = [
      'd."submitted_at" IS NOT NULL',
      ...this.dossierConditions(criteria.filter, p, 'd."createdAt"'),
      this.scopeCondition(criteria.scope, p),
    ];

    const rows: Array<{ hour: string; total: string }> = await this.dataSource.query(
      `SELECT EXTRACT(HOUR FROM d."submitted_at")::int AS hour, COUNT(*)::int AS total
       FROM "declarations" d
       LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
       WHERE ${conditions.join(' AND ')}
       GROUP BY 1`,
      params,
    );
    return rows.map((row) => ({ hour: Number(row.hour), total: Number(row.total) }));
  }

  private async queryPassedByHour(criteria: ReportQueryCriteria): Promise<Array<{ hour: number; total: number }>> {
    const params: unknown[] = [];
    const p = this.binder(params);
    const conditions = [
      `g."decision" = 'ALLOW'`,
      ...this.dossierConditions(criteria.filter, p, 'g."occurred_at"'),
      this.scopeCondition(criteria.scope, p),
    ];

    const rows: Array<{ hour: string; total: string }> = await this.dataSource.query(
      `SELECT EXTRACT(HOUR FROM g."occurred_at")::int AS hour, COUNT(*)::int AS total
       FROM "gate_events" g
       INNER JOIN "declarations" d ON d."id" = g."dossier_id"
       LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
       WHERE ${conditions.join(' AND ')}
       GROUP BY 1`,
      params,
    );
    return rows.map((row) => ({ hour: Number(row.hour), total: Number(row.total) }));
  }

  async countWorkflowStepStates(criteria: ReportQueryCriteria): Promise<WorkflowStepStatusCount[]> {
    const params: unknown[] = [];
    const p = this.binder(params);
    const conditions = [
      ...this.dossierConditions(criteria.filter, p, 'd."createdAt"'),
      this.scopeCondition(criteria.scope, p),
    ];

    const rows: Array<{ step_code: string; status: string; total: string }> = await this.dataSource.query(
      `SELECT s."step_code" AS step_code, s."status" AS status, COUNT(*)::int AS total
       FROM "workflow_instance_steps" s
       INNER JOIN "workflow_instances" wi ON wi."id" = s."instance_id"
       INNER JOIN "declarations" d ON d."id" = wi."dossier_id"
       LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
       WHERE ${conditions.join(' AND ')}
       GROUP BY 1, 2`,
      params,
    );
    return rows.map((row) => ({ stepCode: row.step_code, status: row.status, count: Number(row.total) }));
  }

  async findRejectedDossiers(criteria: ReportQueryCriteria, limit: number): Promise<RejectedDossierRow[]> {
    const params: unknown[] = [];
    const p = this.binder(params);
    const conditions = [
      `d."status" = 'REJECTED'`,
      ...this.dossierConditions(criteria.filter, p, 'd."createdAt"', { ignoreStatus: true }),
      this.scopeCondition(criteria.scope, p),
    ];

    const rows: Array<{ id: string; code: string; reason_note: string | null }> = await this.dataSource.query(
      `SELECT d."id" AS id, d."code" AS code, a."reason_note" AS reason_note
       FROM "declarations" d
       LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
       LEFT JOIN LATERAL (
         SELECT aa."reason_note"
         FROM "agency_actions" aa
         WHERE aa."dossier_id" = d."id" AND aa."decision" = 'REJECT'
         ORDER BY aa."acted_at" DESC
         LIMIT 1
       ) a ON TRUE
       WHERE ${conditions.join(' AND ')}
       ORDER BY d."updatedAt" DESC
       LIMIT ${p(limit)}`,
      params,
    );
    return rows.map((row) => ({ dossierId: row.id, dossierCode: row.code, reasonNote: row.reason_note }));
  }

  async countGateDenials(criteria: ReportQueryCriteria): Promise<number> {
    const params: unknown[] = [];
    const p = this.binder(params);
    const conditions = [
      `g."decision" = 'DENY'`,
      ...this.dossierConditions(criteria.filter, p, 'g."occurred_at"'),
      this.scopeCondition(criteria.scope, p),
    ];

    const rows: Array<{ total: string }> = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total
       FROM "gate_events" g
       INNER JOIN "declarations" d ON d."id" = g."dossier_id"
       LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
       WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Số lượt xe được cho **ra cổng** trong kỳ. Đo theo `gate_events` (chiều `EXIT`, quyết định
   * `ALLOW`), không đếm hồ sơ theo `status` — nên bỏ qua điều kiện `status` của bộ lọc (dashboard
   * cũng không đặt `status`, nhưng để tường minh vẫn `ignoreStatus`). Khoảng kỳ tính theo
   * `occurred_at`, siết theo phạm vi dữ liệu như mọi truy vấn cổng khác.
   */
  async countGateExits(criteria: ReportQueryCriteria): Promise<number> {
    const params: unknown[] = [];
    const p = this.binder(params);
    const conditions = [
      `g."decision" = 'ALLOW'`,
      `g."direction" = 'EXIT'`,
      ...this.dossierConditions(criteria.filter, p, 'g."occurred_at"', { ignoreStatus: true }),
      this.scopeCondition(criteria.scope, p),
    ];

    const rows: Array<{ total: string }> = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total
       FROM "gate_events" g
       INNER JOIN "declarations" d ON d."id" = g."dossier_id"
       LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
       WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Luồng cổng trong ngày hôm nay. Mốc thời gian là `date_trunc('day', now())` — số liệu thời điểm
   * hiện tại, không theo bộ lọc kỳ của dashboard; vẫn siết theo phạm vi dữ liệu.
   */
  async getGateFlowToday(scope: ReportScope): Promise<GateFlowToday> {
    const params: unknown[] = [];
    const p = this.binder(params);
    const conditions = [`g."occurred_at" >= date_trunc('day', now())`, this.scopeCondition(scope, p)];

    const rows: Array<{ passed: string; denied: string }> = await this.dataSource.query(
      `SELECT COUNT(*) FILTER (WHERE g."decision" = 'ALLOW')::int AS passed,
              COUNT(*) FILTER (WHERE g."decision" = 'DENY')::int AS denied
       FROM "gate_events" g
       INNER JOIN "declarations" d ON d."id" = g."dossier_id"
       LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
       WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return { passed: Number(rows[0]?.passed ?? 0), denied: Number(rows[0]?.denied ?? 0) };
  }

  async countWaitingQueue(scope: ReportScope): Promise<number> {
    const params: unknown[] = [];
    const p = this.binder(params);
    // Gọi số đã rút gọn thành "cấp số" (bỏ cột status). "Đang chờ ở hàng đợi" nay = số đã cấp
    // trong NGÀY (giờ VN) — số reset theo ngày nên đây là ảnh chụp hàng đợi hiện thời.
    const conditions = [`q."issued_date" = ${p(vietnamDateString(new Date()))}::date`, this.scopeCondition(scope, p)];

    const rows: Array<{ total: string }> = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total
       FROM "queue_tickets" q
       INNER JOIN "declarations" d ON d."id" = q."dossier_id"
       LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
       WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Hồ sơ đang chờ xử lý liên ngành lâu nhất (SG-251).
   * Lọc các hồ sơ ở trạng thái BUSINESS_PROCESSING hoặc REVISION_REQUIRED có phiên đang chạy,
   * lấy các bước nghiệp vụ liên ngành đang mở (IN_PROGRESS hoặc WAITING_SUPPLEMENT),
   * sắp xếp theo thời gian nộp/tạo hồ sơ tăng dần (hồ sơ tồn đọng lâu nhất lên đầu).
   */
  async findLongestWaitingDossiers(scope: ReportScope, limit: number): Promise<AttentionDossierRow[]> {
    const params: unknown[] = [];
    const p = this.binder(params);
    const conditions = [
      `d."status" IN ('${DeclarationStatus.BUSINESS_PROCESSING}', '${DeclarationStatus.REVISION_REQUIRED}')`,
      `wi."status" = 'IN_PROGRESS'`,
      this.scopeCondition(scope, p),
    ];

    const rows: Array<{
      id: string;
      code: string;
      enterprise_name: string | null;
      type: string;
      step_codes: string | null;
      entered_at: Date | null;
      created_at: Date;
    }> = await this.dataSource.query(
      `SELECT d."id" AS id, d."code" AS code,
              COALESCE(e."name", d."enterpriseTaxCode") AS enterprise_name, d."type" AS type,
              STRING_AGG(DISTINCT s."step_code", ',') AS step_codes,
              MIN(s."entered_at") AS entered_at,
              COALESCE(d."submitted_at", d."createdAt") AS created_at
       FROM "declarations" d
       INNER JOIN "workflow_instances" wi ON wi."dossier_id" = d."id"
       LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
       LEFT JOIN "workflow_instance_steps" s
         ON s."instance_id" = wi."id"
        AND s."status" IN ('IN_PROGRESS', 'WAITING_SUPPLEMENT', 'PENDING')
        AND s."step_code" NOT IN ('EXPORT_B2_ENTRY', 'EXPORT_B1_EXIT', 'IMPORT_B1_ENTRY', 'IMPORT_B2_EXIT', 'EXPORT_DECLARED', 'IMPORT_DECLARED', 'EXPORT_FEE', 'IMPORT_FEE')
       WHERE ${conditions.join(' AND ')}
       GROUP BY d."id", d."code", e."name", d."enterpriseTaxCode", d."type", d."submitted_at", d."createdAt"
       ORDER BY COALESCE(d."submitted_at", d."createdAt") ASC, COALESCE(MIN(s."entered_at"), d."submitted_at", d."createdAt") ASC
       LIMIT ${p(limit)}`,
      params,
    );
    return rows.map((row) => ({
      dossierId: row.id,
      dossierCode: row.code,
      enterpriseName: row.enterprise_name,
      type: row.type,
      stepCode: row.step_codes || '',
      enteredAt: row.entered_at || row.created_at,
    }));
  }

  // ---------------------------------------------------------------- Báo cáo

  async findDossierThroughput(criteria: ReportQueryCriteria): Promise<DossierThroughputRow[]> {
    const params: unknown[] = [];
    const p = this.binder(params);
    const conditions = [
      ...this.dossierConditions(criteria.filter, p, 'd."createdAt"'),
      this.scopeCondition(criteria.scope, p),
    ];

    const rows: Array<{
      day: string;
      total: string;
      submitted: string;
      completed: string;
      rejected: string;
    }> = await this.dataSource.query(
      `SELECT to_char(d."createdAt", 'YYYY-MM-DD') AS day,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE d."submitted_at" IS NOT NULL)::int AS submitted,
              COUNT(*) FILTER (WHERE d."status" = 'COMPLETED')::int AS completed,
              COUNT(*) FILTER (WHERE d."status" = 'REJECTED')::int AS rejected
       FROM "declarations" d
       LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
       WHERE ${conditions.join(' AND ')}
       GROUP BY 1
       ORDER BY 1`,
      params,
    );

    return rows.map((row) => ({
      date: row.day,
      total: Number(row.total),
      submitted: Number(row.submitted),
      completed: Number(row.completed),
      rejected: Number(row.rejected),
    }));
  }

  /**
   * Cơ cấu hồ sơ **theo luồng** (loại hồ sơ) trong kỳ. Đếm theo cột `type`, cùng mốc ngày tạo và
   * cùng phạm vi dữ liệu như `findDossierThroughput` — hai chiều phân tích chia sẻ đúng một bộ lọc.
   */
  async countDossiersByType(criteria: ReportQueryCriteria): Promise<DossierTypeCountRow[]> {
    const params: unknown[] = [];
    const p = this.binder(params);
    const conditions = [
      ...this.dossierConditions(criteria.filter, p, 'd."createdAt"'),
      this.scopeCondition(criteria.scope, p),
    ];

    const rows: Array<{ type: string; total: string }> = await this.dataSource.query(
      `SELECT d."type" AS type, COUNT(*)::int AS total
       FROM "declarations" d
       LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
       WHERE ${conditions.join(' AND ')}
       GROUP BY 1
       ORDER BY 2 DESC`,
      params,
    );

    return rows.map((row) => ({ type: row.type, count: Number(row.total) }));
  }

  async findAgencyActionStats(criteria: ReportQueryCriteria): Promise<AgencyActionStatRow[]> {
    const params: unknown[] = [];
    const p = this.binder(params);
    const conditions = [
      ...this.dossierConditions(criteria.filter, p, 'a."acted_at"'),
      this.scopeCondition(criteria.scope, p),
    ];

    const rows: Array<{
      step_code: string;
      decision: string;
      actions: string;
      total_seconds: string;
      max_seconds: string;
    }> = await this.dataSource.query(
      `SELECT a."step_code" AS step_code, a."decision" AS decision, COUNT(*)::int AS actions,
              COALESCE(SUM(a."elapsed_seconds"), 0)::bigint AS total_seconds,
              COALESCE(MAX(a."elapsed_seconds"), 0)::int AS max_seconds
       FROM "agency_actions" a
       INNER JOIN "declarations" d ON d."id" = a."dossier_id"
       LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
       WHERE ${conditions.join(' AND ')}
       GROUP BY 1, 2`,
      params,
    );

    return rows.map((row) => ({
      stepCode: row.step_code,
      decision: row.decision,
      actions: Number(row.actions),
      totalSeconds: Number(row.total_seconds),
      maxSeconds: Number(row.max_seconds),
    }));
  }

  async findGateEvents(
    criteria: ReportPageQueryCriteria,
  ): Promise<PaginatedResult<GateEventReportRow> & { actionStats?: GateActionStats }> {
    const paging = normalizePaging(criteria.page, criteria.pageSize);
    const params: unknown[] = [];
    const p = this.binder(params);
    const conditions = [
      ...this.dossierConditions(criteria.filter, p, 'g."occurred_at"'),
      this.scopeCondition(criteria.scope, p),
    ];

    // Nối `vehicles` bằng LATERAL LIMIT 1: mỗi sự kiện cổng phải là đúng một dòng. Nối thẳng
    // `LEFT JOIN "vehicles"` sẽ nhân dòng với hồ sơ nhiều xe, làm `COUNT(*)` phồng số sự kiện và
    // danh sách trùng. `v` chỉ dùng để hiển thị biển số (không nằm trong WHERE) nên giới hạn 1 dòng.
    const from = `
      FROM "gate_events" g
      INNER JOIN "declarations" d ON d."id" = g."dossier_id"
      LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
      LEFT JOIN LATERAL (
        SELECT vx."plate_number"
        FROM "vehicles" vx
        WHERE vx."dossier_id" = d."id"
        ORDER BY vx."plate_number" ASC NULLS LAST
        LIMIT 1
      ) v ON true
      WHERE ${conditions.join(' AND ')}
    `;

    const counted: Array<{
      total: string;
      entry_allow: string;
      entry_deny: string;
      exit_allow: string;
      exit_deny: string;
    }> = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE g."direction" = 'ENTRY' AND g."decision" = 'ALLOW')::int AS entry_allow,
              COUNT(*) FILTER (WHERE g."direction" = 'ENTRY' AND g."decision" = 'DENY')::int AS entry_deny,
              COUNT(*) FILTER (WHERE g."direction" = 'EXIT' AND g."decision" = 'ALLOW')::int AS exit_allow,
              COUNT(*) FILTER (WHERE g."direction" = 'EXIT' AND g."decision" = 'DENY')::int AS exit_deny
       ${from}`,
      params,
    );

    const rows: Array<{
      occurred_at: Date;
      dossier_id: string;
      code: string;
      plate_number: string | null;
      gate_code: string;
      direction: string;
      decision: string;
      status_color: string;
      actor_name: string | null;
      note: string | null;
    }> = await this.dataSource.query(
      `SELECT g."occurred_at" AS occurred_at, d."id" AS dossier_id, d."code" AS code,
              COALESCE(v."plate_number", d."plateNumber") AS plate_number,
              g."gate_code" AS gate_code, g."direction" AS direction, g."decision" AS decision,
              g."status_color" AS status_color, g."actor_name" AS actor_name, g."note" AS note
       ${from}
       ORDER BY g."occurred_at" DESC
       LIMIT ${p(paging.take)} OFFSET ${p(paging.skip)}`,
      params,
    );

    const items: GateEventReportRow[] = rows.map((row) => ({
      occurredAt: row.occurred_at,
      dossierId: row.dossier_id,
      dossierCode: row.code,
      plateNumber: row.plate_number ?? '',
      gateCode: row.gate_code,
      direction: row.direction,
      decision: row.decision,
      statusColor: row.status_color,
      actorName: row.actor_name,
      note: row.note,
    }));

    const paginated = toPaginatedResult(items, Number(counted[0]?.total ?? 0), paging);
    return {
      ...paginated,
      actionStats: {
        entryAllow: Number(counted[0]?.entry_allow ?? 0),
        entryDeny: Number(counted[0]?.entry_deny ?? 0),
        exitAllow: Number(counted[0]?.exit_allow ?? 0),
        exitDeny: Number(counted[0]?.exit_deny ?? 0),
      },
    };
  }

  /**
   * Tồn bãi. Số ô đang có xe được đếm **trong phạm vi dữ liệu của người dùng** — tài khoản doanh
   * nghiệp chỉ thấy xe của chính mình, không suy ra được lượng xe của đơn vị khác.
   */
  async findYardOccupancy(criteria: ReportQueryCriteria): Promise<YardOccupancyRow[]> {
    const params: unknown[] = [];
    const p = this.binder(params);
    const scope = this.scopeCondition(criteria.scope, p);

    const rows: Array<{
      code: string;
      name: string;
      capacity: string;
      slots: string;
      occupied: string;
    }> = await this.dataSource.query(
      `SELECT y."code" AS code, y."name" AS name, y."capacity" AS capacity,
              (SELECT COUNT(*)::int FROM "parking_slots" ps
                WHERE ps."yard_id" = y."id" AND ps."is_active" = true) AS slots,
              (SELECT COUNT(*)::int FROM "dispatch_assignments" da
                INNER JOIN "declarations" d ON d."id" = da."dossier_id"
                LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
                WHERE da."yard_id" = y."id" AND da."status" = 'ACTIVE' AND ${scope}) AS occupied
       FROM "yards" y
       WHERE y."is_active" = true
       ORDER BY y."code"`,
      params,
    );

    return rows.map((row) => ({
      yardCode: row.code,
      yardName: row.name,
      capacity: Number(row.capacity),
      slots: Number(row.slots),
      occupied: Number(row.occupied),
    }));
  }

  /** Sức chứa toàn cửa khẩu — không lọc phạm vi, nên use-case chỉ gọi khi người dùng có phạm vi ALL. */
  async findYardCapacity(): Promise<YardOccupancyRow[]> {
    const rows: Array<{ code: string; name: string; capacity: string; slots: string; occupied: string }> =
      await this.dataSource.query(
        `SELECT y."code" AS code, y."name" AS name, y."capacity" AS capacity,
                (SELECT COUNT(*)::int FROM "parking_slots" ps
                  WHERE ps."yard_id" = y."id" AND ps."is_active" = true) AS slots,
                (SELECT COUNT(*)::int FROM "dispatch_assignments" da
                  WHERE da."yard_id" = y."id" AND da."status" = 'ACTIVE') AS occupied
         FROM "yards" y
         WHERE y."is_active" = true
         ORDER BY y."code"`,
      );

    return rows.map((row) => ({
      yardCode: row.code,
      yardName: row.name,
      capacity: Number(row.capacity),
      slots: Number(row.slots),
      occupied: Number(row.occupied),
    }));
  }

  // ---------------------------------------------------------------- Điều kiện dùng chung

  private binder(params: unknown[]): ParamBinder {
    return (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
  }

  /**
   * Điều kiện lọc trên bảng `declarations` (bí danh `d`). `dateColumn` là cột thời gian dùng cho
   * khoảng `from`/`to` — mỗi báo cáo tính kỳ theo mốc riêng: hồ sơ tính theo ngày tạo, nhật ký
   * thao tác theo thời điểm ra quyết định, sự kiện cổng theo thời điểm qua cổng.
   */
  private dossierConditions(
    filter: ReportFilter,
    p: ParamBinder,
    dateColumn: string,
    options: { ignoreStatus?: boolean } = {},
  ): string[] {
    const conditions: string[] = [];
    if (filter.type) conditions.push(`d."type" = ${p(filter.type)}`);
    if (filter.status && !options.ignoreStatus) conditions.push(`d."status" = ${p(filter.status)}`);
    if (filter.checkpoint) conditions.push(`d."checkpoint" = ${p(filter.checkpoint)}`);

    const fromDate = parseFilterStartDate(filter.from);
    if (fromDate) conditions.push(`${dateColumn} >= ${p(fromDate)}`);
    const toDate = parseFilterEndDate(filter.to);
    if (toDate) conditions.push(`${dateColumn} <= ${p(toDate)}`);

    return conditions.length > 0 ? conditions : ['1 = 1'];
  }

  /** Cùng quy tắc phạm vi dữ liệu với danh sách hồ sơ và hàng đợi liên ngành — không nới lỏng. */
  private scopeCondition(scope: ReportScope, p: ParamBinder): string {
    if (scope.unrestricted) {
      return scope.excludeDraft ? `d."status" != '${DeclarationStatus.DRAFT}'` : '1 = 1';
    }
    const taxCodes = scope.taxCodes || [];
    if (taxCodes.length === 0) return `d."created_by_id" = ${p(scope.ownerUserId ?? null)}`;
    const codes = p(taxCodes);
    return `(e."tax_code" = ANY(${codes}) OR (d."enterprise_id" IS NULL AND d."enterpriseTaxCode" = ANY(${codes})))`;
  }
}
