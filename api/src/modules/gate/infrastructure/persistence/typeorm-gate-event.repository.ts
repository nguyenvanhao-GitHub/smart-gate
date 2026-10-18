import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { PaginatedResult, normalizePaging, toPaginatedResult } from '../../../../common/http/pagination';
import { GateDirection } from '../../../catalog/domain/border-facility.catalog';
import { GateDecision, GateEvent } from '../../domain/gate-event.entity';
import {
  GateEventPageCriteria,
  GateEventRepository,
  GateEventRow,
  GateEventSummary,
  GateEventSummaryCriteria,
} from '../../application/ports/gate-event.repository';
import { GateEventMapper } from './gate-event.mapper';
import { GateEventOrmEntity } from './gate-event.orm-entity';

interface DossierLabelRow {
  id: string;
  code: string;
  plate_number: string | null;
}

@Injectable()
export class TypeOrmGateEventRepository implements GateEventRepository {
  constructor(
    @InjectRepository(GateEventOrmEntity)
    private readonly events: Repository<GateEventOrmEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async append(event: GateEvent): Promise<GateEvent> {
    await this.events.insert(GateEventMapper.toPersistence(event));
    return event;
  }

  async findLatestByDossier(dossierId: string): Promise<GateEvent | null> {
    const row = await this.events.findOne({ where: { dossierId }, order: { occurredAt: 'DESC' } });
    return row ? GateEventMapper.toDomain(row) : null;
  }

  async findAllowedDirections(dossierId: string): Promise<GateDirection[]> {
    const rows = await this.events.find({ where: { dossierId, decision: GateDecision.ALLOW } });
    return [...new Set(rows.map((row) => row.direction as GateDirection))];
  }

  async findPage(criteria: GateEventPageCriteria): Promise<PaginatedResult<GateEventRow>> {
    const paging = normalizePaging(criteria.page, criteria.pageSize);
    const params: unknown[] = [];
    const p = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const conditions: string[] = ['1 = 1'];
    if (criteria.dossierId) conditions.push(`g."dossier_id" = ${p(criteria.dossierId)}::uuid`);
    if (criteria.dossierCode?.trim()) conditions.push(`d."code" ILIKE ${p(`%${criteria.dossierCode.trim()}%`)}`);
    if (criteria.plateNumber?.trim()) conditions.push(`COALESCE(v."plate_number", d."plateNumber") ILIKE ${p(`%${criteria.plateNumber.trim()}%`)}`);
    if (criteria.gateCode) conditions.push(`g."gate_code" = ${p(criteria.gateCode)}`);
    if (criteria.direction) conditions.push(`g."direction" = ${p(criteria.direction)}`);
    if (criteria.decision) conditions.push(`g."decision" = ${p(criteria.decision)}`);
    if (criteria.actorName?.trim()) conditions.push(`g."actor_name" ILIKE ${p(`%${criteria.actorName.trim()}%`)}`);
    if (criteria.from) conditions.push(`g."occurred_at" >= ${p(criteria.from)}::timestamptz`);
    if (criteria.to) conditions.push(`g."occurred_at" <= ${p(criteria.to)}::timestamptz`);
    conditions.push(this.scopeCondition(criteria, p));

    const from = `
      FROM "gate_events" g
      LEFT JOIN "declarations" d ON d."id" = g."dossier_id"
      LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
      LEFT JOIN "vehicles" v ON v."dossier_id" = d."id"
      WHERE ${conditions.join(' AND ')}
    `;

    const counted: Array<{ count: string }> = await this.dataSource.query(`SELECT COUNT(*)::int AS count ${from}`, params);
    const total = Number(counted[0]?.count ?? 0);

    const ids: Array<{ id: string }> = await this.dataSource.query(
      `SELECT g."id" ${from} ORDER BY g."occurred_at" DESC LIMIT ${p(paging.take)} OFFSET ${p(paging.skip)}`,
      params,
    );

    return toPaginatedResult(await this.hydrate(ids.map((row) => row.id)), total, paging);
  }

  async summarizeToday(criteria: GateEventSummaryCriteria): Promise<GateEventSummary> {
    const params: unknown[] = [];
    const p = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    // `date_trunc('day', now())` chốt mốc đầu ngày theo múi giờ máy chủ — cùng gốc thời gian với các báo cáo khác.
    const conditions: string[] = [`g."occurred_at" >= date_trunc('day', now())`];
    if (criteria.gateCode) conditions.push(`g."gate_code" = ${p(criteria.gateCode)}`);
    conditions.push(this.scopeCondition(criteria, p));

    const rows: Array<{ decision: string; count: string }> = await this.dataSource.query(
      `SELECT g."decision" AS decision, COUNT(*)::int AS count
       FROM "gate_events" g
       LEFT JOIN "declarations" d ON d."id" = g."dossier_id"
       LEFT JOIN "enterprises" e ON e."id" = d."enterprise_id"
       WHERE ${conditions.join(' AND ')}
       GROUP BY g."decision"`,
      params,
    );

    let allowed = 0;
    let denied = 0;
    for (const row of rows) {
      if (row.decision === 'ALLOW') allowed = Number(row.count);
      else if (row.decision === 'DENY') denied = Number(row.count);
    }
    return { allowed, denied };
  }

  /** Cùng quy tắc phạm vi dữ liệu với danh sách hồ sơ — không nới lỏng ở nhật ký cổng. */
  private scopeCondition(
    criteria: Pick<GateEventPageCriteria, 'unrestricted' | 'taxCodes' | 'ownerUserId'>,
    p: (value: unknown) => string,
  ): string {
    if (criteria.unrestricted) return '1 = 1';
    const taxCodes = criteria.taxCodes || [];
    if (taxCodes.length === 0) return `d."created_by_id" = ${p(criteria.ownerUserId ?? null)}`;
    const codes = p(taxCodes);
    return `(e."tax_code" = ANY(${codes}) OR (d."enterprise_id" IS NULL AND d."enterpriseTaxCode" = ANY(${codes})))`;
  }

  private async hydrate(ids: string[]): Promise<GateEventRow[]> {
    if (ids.length === 0) return [];
    const rows = await this.events.find({ where: { id: In(ids) } });
    const byId = new Map(rows.map((row) => [row.id, row]));

    const dossierIds = [...new Set(rows.map((row) => row.dossierId))];
    const labels: DossierLabelRow[] = await this.dataSource.query(
      `SELECT d."id" AS id, d."code" AS code, COALESCE(v."plate_number", d."plateNumber") AS plate_number
       FROM "declarations" d
       LEFT JOIN "vehicles" v ON v."dossier_id" = d."id"
       WHERE d."id" = ANY($1)`,
      [dossierIds],
    );
    const labelById = new Map(labels.map((row) => [row.id, row]));

    // Giữ đúng thứ tự đã sắp ở câu truy vấn phân trang.
    return ids
      .map((id) => byId.get(id))
      .filter((row): row is GateEventOrmEntity => !!row)
      .map((row) => ({
        event: GateEventMapper.toDomain(row),
        dossierCode: labelById.get(row.dossierId)?.code ?? '',
        plateNumber: labelById.get(row.dossierId)?.plate_number ?? '',
      }));
  }
}
