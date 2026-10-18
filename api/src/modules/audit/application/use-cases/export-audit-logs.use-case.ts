import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { CsvExportResult, buildCsv, csvFileName } from '../../../../common/export/csv-export';
import { MAX_PAGE_SIZE } from '../../../../common/http/pagination';
import { vietnamDateString, vietnamTimeString } from '../../../../common/time/vietnam-date';
import { AuditModuleCode } from '../../domain/audit-module';
import { AuditLog } from '../../domain/audit-log.entity';
import { AUDIT_LOG_REPOSITORY, AuditLogRepository, AuditLogSearchCriteria } from '../ports/audit-log.repository';

/** Trần số dòng cho một lần xuất nhật ký — vượt trần thì cắt, tránh dựng tệp quá lớn. */
export const MAX_AUDIT_EXPORT_ROWS = 5000;

export interface ExportAuditLogsCommand {
  actor?: string;
  action?: string;
  actions?: string[];
  module?: AuditModuleCode;
  target?: string;
  from?: Date;
  to?: Date;
  /** Người thực hiện lệnh xuất — ghi vào nhật ký `REPORT_EXPORT`. */
  actorId: string;
  actorRole: string;
}

const HEADERS = [
  'Thời điểm',
  'Người thực hiện',
  'Vai trò',
  'Hành động',
  'Kết quả',
  'Loại đối tượng',
  'Mã đối tượng',
  'Địa chỉ IP',
] as const;

/**
 * Xuất nhật ký hệ thống ra CSV theo **đúng bộ lọc đang xem** (F58).
 *
 * Đi qua repository chung với màn danh sách nên tệp khớp chính xác những gì người dùng thấy. Mọi lần
 * xuất đều **ghi một dòng nhật ký `REPORT_EXPORT`**: ai xuất, bộ lọc gì, bao nhiêu dòng (BUG-027).
 */
@Injectable()
export class ExportAuditLogsUseCase {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly logs: AuditLogRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: ExportAuditLogsCommand): Promise<CsvExportResult> {
    const criteria: AuditLogSearchCriteria = {
      actor: command.actor,
      action: command.action,
      actions: command.actions,
      module: command.module,
      target: command.target,
      from: command.from,
      to: command.to,
    };

    const rows: AuditLog[] = [];
    let page = 1;
    let result = await this.logs.findMany({ ...criteria, page, pageSize: MAX_PAGE_SIZE });
    while (rows.length < MAX_AUDIT_EXPORT_ROWS) {
      rows.push(...result.items);
      if (rows.length >= result.total || result.items.length === 0) break;
      page += 1;
      result = await this.logs.findMany({ ...criteria, page, pageSize: MAX_PAGE_SIZE });
    }
    const exported = rows.slice(0, MAX_AUDIT_EXPORT_ROWS);

    const content = buildCsv(HEADERS, exported.map((log) => this.toRow(log)));
    return { fileName: csvFileName('nhat-ky-he-thong'), content, rowCount: exported.length };
  }

  private toRow(log: AuditLog): CsvCellRow {
    return [
      `${vietnamDateString(log.at)} ${vietnamTimeString(log.at)}`,
      log.actorUsername ?? '',
      log.actorRole ?? '',
      log.action,
      log.result,
      log.targetType,
      log.targetId ?? '',
      log.ip ?? '',
    ];
  }
}

type CsvCellRow = (string | number | null | undefined)[];
