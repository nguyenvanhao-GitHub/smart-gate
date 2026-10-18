import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { PaginatedResult, normalizePaging, toPaginatedResult } from '../../../../common/http/pagination';
import {
  DeclarationStatus,
  DeclarationType,
  POST_INTERAGENCY_STATUSES,
} from '../../../declarations/domain/declaration.enums';
import { AgencyAction } from '../../domain/agency-action.entity';
import { WorkflowInstance } from '../../domain/workflow-instance.entity';
import { QueueTab, WorkflowInstanceStatus, WorkflowStepStatus } from '../../domain/workflow.enums';
import {
  WorkflowInstanceRepository,
  WorkflowQueueCriteria,
  WorkflowQueueRow,
} from '../../application/ports/workflow-instance.repository';
import { AgencyActionOrmEntity } from './agency-action.orm-entity';
import { WorkflowInstanceMapper } from './workflow-instance.mapper';
import { WorkflowInstanceStepOrmEntity } from './workflow-instance-step.orm-entity';
import { WorkflowInstanceOrmEntity } from './workflow-instance.orm-entity';

/** Một dòng thô của truy vấn hàng đợi. */
interface QueueSqlRow {
  dossier_id: string;
  code: string;
  type: string;
  status: string;
  epidemic_flag: boolean;
  tax_code: string | null;
  enterprise_name: string | null;
  plate_number: string | null;
  created_at: Date;
  updated_at: Date;
  submitted_at: Date | null;
  instance_id: string | null;
}

@Injectable()
export class TypeOrmWorkflowInstanceRepository implements WorkflowInstanceRepository {
  constructor(
    @InjectRepository(WorkflowInstanceOrmEntity)
    private readonly instances: Repository<WorkflowInstanceOrmEntity>,
    @InjectRepository(WorkflowInstanceStepOrmEntity)
    private readonly steps: Repository<WorkflowInstanceStepOrmEntity>,
    @InjectRepository(AgencyActionOrmEntity)
    private readonly actions: Repository<AgencyActionOrmEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findByDossierId(dossierId: string): Promise<WorkflowInstance | null> {
    const row = await this.instances.findOne({ where: { dossierId } });
    if (!row) return null;
    const steps = await this.steps.find({ where: { instanceId: row.id } });
    return WorkflowInstanceMapper.toDomain(row, steps);
  }

  /** Ghi phiên và toàn bộ bước trong một giao dịch — không để phiên có nửa số bước. */
  async save(instance: WorkflowInstance): Promise<WorkflowInstance> {
    await this.dataSource.transaction(async (manager) => {
      await manager.save(WorkflowInstanceMapper.toPersistence(instance));
      const rows = instance.steps.map((state) => WorkflowInstanceMapper.toStepPersistence(instance.id, state));
      if (rows.length > 0) await manager.save(rows);
    });
    return instance;
  }

  async appendAction(action: AgencyAction): Promise<void> {
    await this.actions.save(WorkflowInstanceMapper.toActionPersistence(action));
  }

  async findActionsByDossierId(dossierId: string): Promise<AgencyAction[]> {
    const rows = await this.actions.find({
      where: { dossierId },
      order: { actedAt: 'ASC' },
    });
    return rows.map((row) => WorkflowInstanceMapper.toActionDomain(row));
  }

  async findQueue(criteria: WorkflowQueueCriteria): Promise<PaginatedResult<WorkflowQueueRow>> {
    const paging = normalizePaging(criteria.page, criteria.pageSize);

    // --- 1. Truy vấn số liệu 3 tab (stats) ---
    const statsParams: unknown[] = [];
    const pStats = (value: unknown): string => {
      statsParams.push(value);
      return `$${statsParams.length}`;
    };

    const condTodoStats = this.tabCondition({ ...criteria, tab: QueueTab.TODO }, pStats);
    const condDoneStats = this.tabCondition({ ...criteria, tab: QueueTab.DONE }, pStats);
    const condWaitingStats = this.tabCondition({ ...criteria, tab: QueueTab.WAITING }, pStats);

    const baseConditionsStats: string[] = [
      `d."status" NOT IN ('${DeclarationStatus.DRAFT}', '${DeclarationStatus.CANCELLED}')`,
    ];

    if (criteria.type) baseConditionsStats.push(`d."type" = ${pStats(criteria.type)}`);
    if (criteria.status) baseConditionsStats.push(`d."status" = ${pStats(criteria.status)}`);
    if (criteria.checkpoint) baseConditionsStats.push(`d."checkpoint" = ${pStats(criteria.checkpoint)}`);
    // Khoảng ngày hồ sơ vào hàng đợi = thời điểm gửi (chưa gửi thì lấy ngày tạo). Cắt theo đầu/cuối
    // ngày giờ VN để không loại nhầm cả ngày biên (BUG-025/F20).
    const enteredQueueAt = `COALESCE(d."submitted_at", d."createdAt")`;
    if (criteria.from) baseConditionsStats.push(`${enteredQueueAt} >= ${pStats(criteria.from)}`);
    if (criteria.to) baseConditionsStats.push(`${enteredQueueAt} <= ${pStats(criteria.to)}`);
    if (criteria.keyword?.trim()) {
      const keyword = pStats(`%${criteria.keyword.trim()}%`);
      baseConditionsStats.push(
        `(d."code" ILIKE ${keyword} OR d."plateNumber" ILIKE ${keyword} OR d."enterpriseTaxCode" ILIKE ${keyword} OR e."name" ILIKE ${keyword})`,
      );
    }
    baseConditionsStats.push(this.scopeCondition(criteria, pStats));

    const statsFrom = `
      FROM "declarations" d
      LEFT JOIN "workflow_instances" wi ON wi."dossier_id" = d."id"
      LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
      WHERE ${baseConditionsStats.join(' AND ')}
    `;

    const countedStats: Array<{ count_todo: string; count_done: string; count_waiting: string }> = await this.dataSource.query(
      `SELECT
        COUNT(CASE WHEN (${condTodoStats}) THEN 1 END)::int AS count_todo,
        COUNT(CASE WHEN (${condDoneStats}) THEN 1 END)::int AS count_done,
        COUNT(CASE WHEN (${condWaitingStats}) THEN 1 END)::int AS count_waiting
       ${statsFrom}`,
      statsParams,
    );

    const stats = {
      todo: Number(countedStats[0]?.count_todo ?? 0),
      done: Number(countedStats[0]?.count_done ?? 0),
      waiting: Number(countedStats[0]?.count_waiting ?? 0),
    };

    const total = criteria.tab === QueueTab.DONE ? stats.done : criteria.tab === QueueTab.WAITING ? stats.waiting : stats.todo;

    // --- 2. Truy vấn danh sách dòng của tab hiện tại ---
    const rowsParams: unknown[] = [];
    const pRows = (value: unknown): string => {
      rowsParams.push(value);
      return `$${rowsParams.length}`;
    };

    const activeTabCond = this.tabCondition(criteria, pRows);

    const baseConditionsRows: string[] = [
      `d."status" NOT IN ('${DeclarationStatus.DRAFT}', '${DeclarationStatus.CANCELLED}')`,
    ];

    if (criteria.type) baseConditionsRows.push(`d."type" = ${pRows(criteria.type)}`);
    if (criteria.status) baseConditionsRows.push(`d."status" = ${pRows(criteria.status)}`);
    if (criteria.checkpoint) baseConditionsRows.push(`d."checkpoint" = ${pRows(criteria.checkpoint)}`);
    if (criteria.from) baseConditionsRows.push(`${enteredQueueAt} >= ${pRows(criteria.from)}`);
    if (criteria.to) baseConditionsRows.push(`${enteredQueueAt} <= ${pRows(criteria.to)}`);
    if (criteria.keyword?.trim()) {
      const keyword = pRows(`%${criteria.keyword.trim()}%`);
      baseConditionsRows.push(
        `(d."code" ILIKE ${keyword} OR d."plateNumber" ILIKE ${keyword} OR d."enterpriseTaxCode" ILIKE ${keyword} OR e."name" ILIKE ${keyword})`,
      );
    }
    baseConditionsRows.push(this.scopeCondition(criteria, pRows));

    // Nối `vehicles` bằng LATERAL LIMIT 1 chứ không phải LEFT JOIN thẳng: hồ sơ nhiều xe sẽ nhân
    // dòng, làm `COUNT(*)` phồng số và danh sách xuất hiện trùng hồ sơ. `v` chỉ dùng để HIỂN THỊ biển
    // số (không nằm trong WHERE), nên giới hạn 1 dòng/hồ sơ là đủ và đúng cho cả đếm lẫn liệt kê.
    const from = `
      FROM "declarations" d
      LEFT JOIN "workflow_instances" wi ON wi."dossier_id" = d."id"
      LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
      LEFT JOIN LATERAL (
        SELECT vx."plate_number"
        FROM "vehicles" vx
        WHERE vx."dossier_id" = d."id"
        ORDER BY vx."plate_number" ASC NULLS LAST
        LIMIT 1
      ) v ON true
      WHERE ${baseConditionsRows.join(' AND ')} AND (${activeTabCond})
    `;

    const rows: QueueSqlRow[] = await this.dataSource.query(
      `SELECT d."id" AS dossier_id, d."code" AS code, d."type" AS type, d."status" AS status,
              COALESCE(d."epidemic_flag", false) AS epidemic_flag,
              COALESCE(e."tax_code", d."enterpriseTaxCode") AS tax_code,
              COALESCE(e."name", '') AS enterprise_name,
              COALESCE(v."plate_number", d."plateNumber") AS plate_number,
              d."createdAt" AS created_at, d."updatedAt" AS updated_at, d."submitted_at" AS submitted_at,
              wi."id" AS instance_id
       ${from}
       ORDER BY d."updatedAt" DESC
       LIMIT ${pRows(paging.take)} OFFSET ${pRows(paging.skip)}`,
      rowsParams,
    );

    return toPaginatedResult(await this.hydrate(rows), total, paging, stats);
  }

  /**
   * Cấu hình điều kiện 03 tab (Cần xử lý, Đã xử lý, Chờ bổ sung) cho Tài khoản Lực lượng và Admin.
   */
  private tabCondition(criteria: WorkflowQueueCriteria, p: (value: unknown) => string): string {
    const doneStatuses = POST_INTERAGENCY_STATUSES.map((v) => `'${v}'`).join(', ');

    if (criteria.isAdmin) {
      const inspection = p(
        criteria.inspectionStepCodes?.length ? criteria.inspectionStepCodes : criteria.actionableStepCodes,
      );

      if (criteria.tab === QueueTab.DONE) {
        // Admin - Tab "Đã xử lý": Chỉ hiển thị các hồ sơ đã hoàn thành xử lý của cả 03 lực lượng (Biên phòng, Hải quan và Kiểm dịch)
        return `(
          d."status" IN (${doneStatuses})
          OR (
            wi."id" IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM "workflow_instance_steps" wis
              WHERE wis."instance_id" = wi."id"
                AND wis."step_code" = ANY(${inspection})
                AND wis."status" != '${WorkflowStepStatus.COMPLETED}'
            )
          )
        )`;
      }

      if (criteria.tab === QueueTab.WAITING) {
        // Admin - Tab "Chờ bổ sung": Hiển thị các hồ sơ được Biên phòng/Hải quan/Kiểm dịch yêu cầu sửa đổi, bổ sung
        return `(
          d."status" IN ('${DeclarationStatus.REVISION_REQUIRED}', 'NEED_SUPPLEMENT')
          OR (
            wi."id" IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM "workflow_instance_steps" wis
              WHERE wis."instance_id" = wi."id"
                AND wis."step_code" = ANY(${inspection})
                AND wis."status" = '${WorkflowStepStatus.WAITING_SUPPLEMENT}'
            )
          )
        )`;
      }

      // Admin - Tab "Cần xử lý": Hiển thị các hồ sơ chưa hoàn thành đầy đủ 03 bước xử lý liên ngành và không chờ bổ sung
      return `(
        d."status" = '${DeclarationStatus.BUSINESS_PROCESSING}'
        AND (
          wi."id" IS NULL
          OR (
            wi."status" = '${WorkflowInstanceStatus.IN_PROGRESS}'
            AND EXISTS (
              SELECT 1 FROM "workflow_instance_steps" wis
              WHERE wis."instance_id" = wi."id"
                AND wis."step_code" = ANY(${inspection})
                AND wis."status" != '${WorkflowStepStatus.COMPLETED}'
            )
            AND NOT EXISTS (
              SELECT 1 FROM "workflow_instance_steps" wis
              WHERE wis."instance_id" = wi."id"
                AND wis."step_code" = ANY(${inspection})
                AND wis."status" = '${WorkflowStepStatus.WAITING_SUPPLEMENT}'
            )
          )
        )
      )`;
    }

    // --- DÀNH CHO TÀI KHOẢN LỰC LƯỢNG (BIÊN PHÒNG / HẢI QUAN / KIỂM DỊCH) ---
    if (criteria.actionableStepCodes.length === 0) return '1 = 0';
    const actionable = p(criteria.actionableStepCodes);

    if (criteria.tab === QueueTab.DONE) {
      // Lực lượng - Tab "Đã xử lý": Hiển thị các hồ sơ đã được chính tài khoản/lực lượng đó xử lý
      return `(
        wi."id" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "workflow_instance_steps" wis
          WHERE wis."instance_id" = wi."id"
            AND wis."step_code" = ANY(${actionable})
            AND wis."status" = '${WorkflowStepStatus.COMPLETED}'
        )
      )`;
    }

    if (criteria.tab === QueueTab.WAITING) {
      // Lực lượng - Tab "Chờ bổ sung": Hiển thị các hồ sơ do CHÍNH lực lượng đó yêu cầu sửa đổi, bổ sung
      return `(
        wi."id" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "workflow_instance_steps" wis
          WHERE wis."instance_id" = wi."id"
            AND wis."step_code" = ANY(${actionable})
            AND wis."status" = '${WorkflowStepStatus.WAITING_SUPPLEMENT}'
        )
      )`;
    }

    // Lực lượng - Tab "Cần xử lý": Hiển thị các hồ sơ đang chờ tài khoản của lực lượng đó xử lý
    const exportMatch = criteria.defaultExportStepCode ? p(criteria.defaultExportStepCode) : null;
    const importMatch = criteria.defaultImportStepCode ? p(criteria.defaultImportStepCode) : null;
    const defaultCheck =
      exportMatch && importMatch
        ? `OR (wi."id" IS NULL AND ((d."type" IN ('${DeclarationType.EXPORT}', '${DeclarationType.TRANSSHIPMENT_EXPORT}') AND ${exportMatch} = ANY(${actionable})) OR (d."type" NOT IN ('${DeclarationType.EXPORT}', '${DeclarationType.TRANSSHIPMENT_EXPORT}') AND ${importMatch} = ANY(${actionable}))))`
        : '';

    return `(
      d."status" = '${DeclarationStatus.BUSINESS_PROCESSING}'
      AND (
        (
          wi."id" IS NOT NULL
          AND wi."status" = '${WorkflowInstanceStatus.IN_PROGRESS}'
          AND EXISTS (
            SELECT 1 FROM "workflow_instance_steps" wis
            WHERE wis."instance_id" = wi."id"
              AND wis."step_code" = ANY(${actionable})
              AND wis."status" = '${WorkflowStepStatus.IN_PROGRESS}'
          )
        )
        ${defaultCheck}
      )
    )`;
  }

  /** Cùng quy tắc phạm vi dữ liệu với danh sách hồ sơ — không nới lỏng ở hàng đợi. */
  private scopeCondition(
    criteria: { unrestricted: boolean; ownerUserId?: string; taxCodes?: string[] },
    p: (value: unknown) => string,
  ): string {
    if (criteria.unrestricted) return '1 = 1';
    const taxCodes = criteria.taxCodes || [];
    if (taxCodes.length === 0) return `d."created_by_id" = ${p(criteria.ownerUserId ?? null)}`;
    const codes = p(taxCodes);
    return `(e."tax_code" = ANY(${codes}) OR (d."enterprise_id" IS NULL AND d."enterpriseTaxCode" = ANY(${codes})))`;
  }

  private async hydrate(rows: QueueSqlRow[]): Promise<WorkflowQueueRow[]> {
    const instanceIds = rows.map((row) => row.instance_id).filter((id): id is string => !!id);
    const instanceRows = instanceIds.length
      ? await this.instances.find({ where: { id: In(instanceIds) } })
      : [];
    const stepRows = instanceIds.length ? await this.steps.find({ where: { instanceId: In(instanceIds) } }) : [];

    const stepsByInstance = new Map<string, WorkflowInstanceStepOrmEntity[]>();
    stepRows.forEach((step) => {
      const bucket = stepsByInstance.get(step.instanceId) ?? [];
      bucket.push(step);
      stepsByInstance.set(step.instanceId, bucket);
    });
    const instanceById = new Map(
      instanceRows.map((row) => [row.id, WorkflowInstanceMapper.toDomain(row, stepsByInstance.get(row.id) ?? [])]),
    );

    return rows.map((row) => ({
      instance: row.instance_id ? (instanceById.get(row.instance_id) ?? null) : null,
      dossier: {
        id: row.dossier_id,
        code: row.code,
        type: row.type as DeclarationType,
        status: row.status as DeclarationStatus,
        epidemicFlag: Boolean(row.epidemic_flag),
        enterpriseTaxCode: row.tax_code ?? '',
        enterpriseName: row.enterprise_name ?? '',
        plateNumber: row.plate_number ?? '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        submittedAt: row.submitted_at,
      },
    }));
  }
}
