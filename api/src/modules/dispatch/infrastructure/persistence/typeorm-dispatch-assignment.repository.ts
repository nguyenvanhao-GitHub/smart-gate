import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { readUniqueViolation } from '../../../../common/persistence/unique-violation';
import { DeclarationStatus, DeclarationType } from '../../../declarations/domain/declaration.enums';
import { WorkflowStepStatus } from '../../../workflow/domain/workflow.enums';
import { DispatchAssignment, DispatchAssignmentStatus } from '../../domain/dispatch-assignment.entity';
import { InspectionStatus } from '../../domain/inspection-status.rules';
import {
  DispatchAssignmentConflictError,
  DispatchAssignmentRepository,
  DispatchAssignmentWithDossier,
  DispatchBoardCriteria,
  DispatchBoardRow,
} from '../../application/ports/dispatch-assignment.repository';
import { DispatchAssignmentOrmEntity } from './dispatch-assignment.orm-entity';
import { DispatchMapper } from './dispatch.mapper';

/** Cột của bảng vị trí dùng lại ở nhiều câu truy vấn thô. */
const ASSIGNMENT_COLUMNS = `
  a."id" AS a_id, a."dossier_id" AS a_dossier_id, a."gate_code" AS a_gate_code, a."lane_code" AS a_lane_code,
  a."yard_id" AS a_yard_id, a."slot_code" AS a_slot_code, a."status" AS a_status,
  a."assigned_at" AS a_assigned_at, a."released_at" AS a_released_at,
  a."assigned_by_id" AS a_assigned_by_id, a."note" AS a_note, a."updated_at" AS a_updated_at,
  a."inspection_status" AS a_inspection_status, a."inspection_updated_at" AS a_inspection_updated_at
`;

interface AssignmentSqlRow {
  a_id: string | null;
  a_dossier_id: string;
  a_gate_code: string | null;
  a_lane_code: string | null;
  a_yard_id: string | null;
  a_slot_code: string | null;
  a_status: string;
  a_assigned_at: Date;
  a_released_at: Date | null;
  a_assigned_by_id: string | null;
  a_note: string | null;
  a_updated_at: Date;
  a_inspection_status: string;
  a_inspection_updated_at: Date | null;
}

interface BoardSqlRow extends AssignmentSqlRow {
  dossier_id: string;
  code: string;
  plate_number: string | null;
  enterprise_name: string | null;
  dossier_status: string;
  dossier_type: string;
  ticket_number: number | null;
  issued_date: string | null;
  waiting_since: Date;
  current_step_code: string | null;
  active_step_codes: string[] | null;
}

@Injectable()
export class TypeOrmDispatchAssignmentRepository implements DispatchAssignmentRepository {
  constructor(
    @InjectRepository(DispatchAssignmentOrmEntity)
    private readonly assignments: Repository<DispatchAssignmentOrmEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async insert(assignment: DispatchAssignment): Promise<DispatchAssignment> {
    try {
      await this.assignments.insert(DispatchMapper.toPersistence(assignment));
      return assignment;
    } catch (error) {
      throw this.toConflict(error) ?? error;
    }
  }

  async update(assignment: DispatchAssignment): Promise<DispatchAssignment> {
    try {
      await this.assignments.save(DispatchMapper.toPersistence(assignment));
      return assignment;
    } catch (error) {
      throw this.toConflict(error) ?? error;
    }
  }

  async findById(id: string): Promise<DispatchAssignment | null> {
    const row = await this.assignments.findOne({ where: { id } });
    return row ? DispatchMapper.toDomain(row) : null;
  }

  async findActiveByDossier(dossierId: string): Promise<DispatchAssignment | null> {
    const row = await this.assignments.findOne({
      where: { dossierId, status: DispatchAssignmentStatus.ACTIVE },
    });
    return row ? DispatchMapper.toDomain(row) : null;
  }

  async findActiveBySlot(yardId: string, slotCode: string): Promise<DispatchAssignment | null> {
    const row = await this.assignments.findOne({
      where: { yardId, slotCode, status: DispatchAssignmentStatus.ACTIVE },
    });
    return row ? DispatchMapper.toDomain(row) : null;
  }

  async findActiveByYard(yardId: string): Promise<DispatchAssignmentWithDossier[]> {
    const rows: Array<AssignmentSqlRow & { code: string | null; plate_number: string | null; enterprise_name: string | null }> =
      await this.dataSource.query(
        `SELECT ${ASSIGNMENT_COLUMNS},
                d."code" AS code,
                COALESCE(v."plate_number", d."plateNumber") AS plate_number,
                COALESCE(e."name", '') AS enterprise_name
         FROM "dispatch_assignments" a
         LEFT JOIN "declarations" d ON d."id" = a."dossier_id"
         LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
         LEFT JOIN LATERAL (
           SELECT vx."plate_number"
           FROM "vehicles" vx
           WHERE vx."dossier_id" = d."id"
           ORDER BY vx."plate_number" ASC NULLS LAST
           LIMIT 1
         ) v ON true
         WHERE a."yard_id" = $1 AND a."status" = $2 AND a."slot_code" IS NOT NULL`,
        [yardId, DispatchAssignmentStatus.ACTIVE],
      );

    return rows.map((row) => ({
      assignment: this.toAssignment(row) as DispatchAssignment,
      dossierCode: row.code ?? '',
      plateNumber: row.plate_number ?? '',
      enterpriseName: row.enterprise_name ?? '',
    }));
  }

  async countOccupiedByYard(): Promise<Map<string, number>> {
    const rows: Array<{ yard_id: string; count: number }> = await this.dataSource.query(
      `SELECT "yard_id", COUNT(*)::int AS count
       FROM "dispatch_assignments"
       WHERE "status" = $1 AND "yard_id" IS NOT NULL AND "slot_code" IS NOT NULL
       GROUP BY "yard_id"`,
      [DispatchAssignmentStatus.ACTIVE],
    );
    return new Map(rows.map((row) => [row.yard_id, Number(row.count)]));
  }

  async countOverdueByYard(overdueBefore: Date): Promise<Map<string, number>> {
    const rows: Array<{ yard_id: string; count: number }> = await this.dataSource.query(
      `SELECT "yard_id", COUNT(*)::int AS count
       FROM "dispatch_assignments"
       WHERE "status" = $1 AND "yard_id" IS NOT NULL AND "slot_code" IS NOT NULL AND "assigned_at" < $2
       GROUP BY "yard_id"`,
      [DispatchAssignmentStatus.ACTIVE, overdueBefore],
    );
    return new Map(rows.map((row) => [row.yard_id, Number(row.count)]));
  }

  /**
   * Bảng điều phối (UI-08). CR41 — lấy mọi hồ sơ **đang có bước workflow mở** (giai đoạn hiện hành ∈
   * cổng vào / cụm kiểm tra / thu phí / cổng ra); use-case suy giai đoạn từ `active_step_codes` để xếp
   * khung. Bốn `LEFT JOIN LATERAL` chọn đúng **tập bước đang mở**, một số thứ tự, một vị trí mới nhất
   * và **một biển số xác định** cho mỗi hồ sơ. Dùng LATERAL cho `vehicles` (thay vì JOIN thẳng) để
   * **mỗi hồ sơ chỉ còn đúng một dòng**: hồ sơ nhiều xe trước đây bị JOIN nhân thành nhiều thẻ cùng
   * trỏ một vị trí, và biển số `COALESCE` lấy không xác định. Nay chọn biển số nhỏ nhất (NULLS LAST).
   *
   * Truy vấn thô có chạm bảng của phân hệ khác (`queue_tickets`, `declarations`, `enterprises`,
   * `vehicles`) — đây là **mô hình đọc**, cùng cách làm với hàng đợi liên ngành ở P3, để tránh
   * gọi vòng qua nhiều repository chỉ để dựng một bảng hiển thị.
   */
  async findBoard(criteria: DispatchBoardCriteria): Promise<DispatchBoardRow[]> {
    const params: unknown[] = [];
    const p = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const date = p(criteria.date);
    const activeStatus = p(DispatchAssignmentStatus.ACTIVE);
    const openStepStatuses = p([WorkflowStepStatus.IN_PROGRESS, WorkflowStepStatus.WAITING_SUPPLEMENT]);
    const conditions: string[] = [
      `d."status" NOT IN ('${DeclarationStatus.DRAFT}', '${DeclarationStatus.CANCELLED}')`,
      // CR41 — chỉ hồ sơ có **bước đang mở** (giai đoạn hiện hành ∈ cổng vào/kiểm tra/thu phí/cổng ra);
      // hồ sơ nháp/chưa vào cửa khẩu và hồ sơ đã hoàn tất/đã ra (không còn bước mở) đều bị loại.
      'act."codes" IS NOT NULL',
    ];
    if (criteria.checkpoint) {
      conditions.push(`COALESCE(q."checkpoint", d."checkpoint") = ${p(criteria.checkpoint)}`);
    }
    // SG-144 — Bộ lọc trên màn Điều phối là khoảng **ngày bắt đầu hồ sơ**.  Đặt điều kiện
    // ở `WHERE` (thay vì chỉ thay ngày JOIN queue_tickets) để số thẻ/KPI thực sự đổi theo
    // lựa chọn của người dùng. `from`/`to` đã được controller đổi thành ranh giới ngày VN.
    if (criteria.from) {
      conditions.push(`d."createdAt" >= ${p(criteria.from)}`);
    }
    if (criteria.to) {
      conditions.push(`d."createdAt" <= ${p(criteria.to)}`);
    }
    if (criteria.search?.trim()) {
      const keyword = p(`%${criteria.search.trim()}%`);
      conditions.push(`(d."code" ILIKE ${keyword} OR COALESCE(v."plate_number", d."plateNumber") ILIKE ${keyword})`);
    }
    conditions.push(this.scopeCondition(criteria, p));

    const rows: BoardSqlRow[] = await this.dataSource.query(
      `SELECT d."id" AS dossier_id, d."code" AS code, d."status" AS dossier_status, d."type" AS dossier_type,
              COALESCE(v."plate_number", d."plateNumber") AS plate_number,
              COALESCE(e."name", '') AS enterprise_name,
              q."ticket_number"::int AS ticket_number,
              COALESCE(q."issued_at", d."submitted_at", d."createdAt") AS waiting_since,
              wi."current_step_code" AS current_step_code,
              act."codes" AS active_step_codes,
              ${ASSIGNMENT_COLUMNS}
       FROM "declarations" d
       LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
       LEFT JOIN LATERAL (
         SELECT vx."plate_number"
         FROM "vehicles" vx
         WHERE vx."dossier_id" = d."id"
         ORDER BY vx."plate_number" ASC NULLS LAST
         LIMIT 1
       ) v ON true
       LEFT JOIN "workflow_instances" wi ON wi."dossier_id" = d."id"
       LEFT JOIN LATERAL (
         SELECT array_agg(s."step_code" ORDER BY s."step_order") AS codes,
                MIN(s."entered_at") AS entered_at
         FROM "workflow_instance_steps" s
         WHERE s."instance_id" = wi."id"
           AND s."status" = ANY(${openStepStatuses})
       ) act ON true
       LEFT JOIN LATERAL (
         SELECT t."id", t."ticket_number", t."issued_date"::text AS issued_date, t."issued_at", t."checkpoint"
         FROM "queue_tickets" t
         WHERE t."dossier_id" = d."id"
         ORDER BY (t."issued_date" = ${date}::date) DESC, t."issued_date" DESC, t."ticket_number" ASC
         LIMIT 1
       ) q ON true
       LEFT JOIN LATERAL (
         SELECT x.*
         FROM "dispatch_assignments" x
         WHERE x."dossier_id" = d."id"
           AND (x."status" = ${activeStatus} OR x."released_at"::date = ${date}::date)
         ORDER BY (x."status" = ${activeStatus}) DESC, x."assigned_at" DESC
         LIMIT 1
       ) a ON true
       WHERE ${conditions.join(' AND ')}
       ORDER BY act."entered_at" ASC NULLS LAST, q."issued_date" ASC NULLS LAST, q."ticket_number" ASC NULLS LAST, d."createdAt" ASC`,
      params,
    );

    return rows.map((row) => ({
      dossierId: row.dossier_id,
      dossierCode: row.code,
      plateNumber: row.plate_number ?? '',
      enterpriseName: row.enterprise_name ?? '',
      dossierStatus: row.dossier_status as DeclarationStatus,
      dossierType: row.dossier_type as DeclarationType,
      ticketNumber: row.ticket_number === null ? null : Number(row.ticket_number),
      ticketIssuedDate: row.issued_date ?? null,
      waitingSince: new Date(row.waiting_since),
      currentStepCode: row.current_step_code,
      activeStepCodes: row.active_step_codes ?? [],
      assignment: this.toAssignment(row),
    }));
  }

  /** Cùng quy tắc phạm vi dữ liệu với danh sách hồ sơ — không nới lỏng ở bảng điều phối. */
  private scopeCondition(criteria: DispatchBoardCriteria, p: (value: unknown) => string): string {
    if (criteria.unrestricted) return '1 = 1';
    const taxCodes = criteria.taxCodes || [];
    if (taxCodes.length === 0) return `d."created_by_id" = ${p(criteria.ownerUserId ?? null)}`;
    const codes = p(taxCodes);
    return `(e."tax_code" = ANY(${codes}) OR (d."enterprise_id" IS NULL AND d."enterpriseTaxCode" = ANY(${codes})))`;
  }

  private toAssignment(row: AssignmentSqlRow): DispatchAssignment | null {
    if (!row.a_id) return null;
    return new DispatchAssignment(
      row.a_id,
      row.a_dossier_id,
      row.a_gate_code,
      row.a_lane_code,
      row.a_yard_id,
      row.a_slot_code,
      row.a_status as DispatchAssignmentStatus,
      new Date(row.a_assigned_at),
      row.a_released_at ? new Date(row.a_released_at) : null,
      row.a_assigned_by_id,
      row.a_note,
      new Date(row.a_updated_at),
      row.a_inspection_status as InspectionStatus,
      row.a_inspection_updated_at ? new Date(row.a_inspection_updated_at) : null,
    );
  }

  /** Đổi lỗi trùng chỉ mục của PostgreSQL thành lỗi nghiệp vụ mà use-case hiểu được. */
  private toConflict(error: unknown): DispatchAssignmentConflictError | null {
    const violation = readUniqueViolation(error);
    if (!violation) return null;
    return new DispatchAssignmentConflictError(
      violation.constraint === 'uq_dispatch_assignments_active_slot' ? 'SLOT' : 'DOSSIER',
    );
  }
}
