import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { MAX_PAGE_SIZE } from '../../../../common/http/pagination';
import { findReportDefinition } from '../../domain/report.catalog';
import { ExportReportCommand } from '../dto/run-report.command';
import { ReportWorkbookService } from '../services/report-workbook.service';
import { RunReportUseCase } from './run-report.use-case';
import { appNotFound } from '../../../../common/i18n';

/** Trần số dòng cho một lần xuất. Vượt trần thì cắt và ghi cảnh báo ngay trên tệp lẫn nhật ký. */
export const MAX_EXPORT_ROWS = 5000;

export interface ReportExportResult {
  fileName: string;
  content: Buffer;
  rowCount: number;
  truncated: boolean;
}

/**
 * Xuất báo cáo ra Excel (F58).
 *
 * Hai ràng buộc bắt buộc, cả hai đều đến từ việc **dùng lại `RunReportUseCase`** thay vì viết
 * truy vấn riêng:
 * - **Đúng bộ lọc đang xem** — cùng `filter`, chỉ khác ở chỗ duyệt hết các trang.
 * - **Đúng phạm vi dữ liệu** — `RunReportUseCase` tự suy `scope` từ `access`, không có đường nào
 *   xuất rộng hơn những gì người dùng nhìn thấy trên màn hình.
 *
 * Mọi lần xuất đều **ghi nhật ký kiểm toán**: ai xuất, báo cáo nào, bộ lọc gì, bao nhiêu dòng.
 */
@Injectable()
export class ExportReportUseCase {
  constructor(
    private readonly runReport: RunReportUseCase,
    private readonly workbook: ReportWorkbookService,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: ExportReportCommand): Promise<ReportExportResult> {
    const definition = findReportDefinition(command.code);
    if (!definition) {
      throw appNotFound('report.notFound', { code: command.code });
    }

    const rows: Array<Record<string, unknown>> = [];
    let page = 1;
    let result = await this.runPage(command, page);

    while (rows.length < MAX_EXPORT_ROWS) {
      rows.push(...result.rows);
      if (rows.length >= result.total || result.rows.length === 0) break;
      page += 1;
      result = await this.runPage(command, page);
    }

    const truncated = rows.length > MAX_EXPORT_ROWS || result.total > MAX_EXPORT_ROWS;
    const exported = rows.slice(0, MAX_EXPORT_ROWS);

    const actorLabel = command.actorName || command.actorId;
    const content = await this.workbook.build({
      result: { ...result, rows: exported },
      filter: command.filter,
      actorName: actorLabel,
      truncated,
    });

    return {
      fileName: this.buildFileName(definition.code),
      content,
      rowCount: exported.length,
      truncated,
    };
  }

  private runPage(command: ExportReportCommand, page: number) {
    return this.runReport.execute({
      code: command.code,
      filter: command.filter,
      page,
      pageSize: MAX_PAGE_SIZE,
      access: command.access,
    });
  }

  /** SG-179: `bao-cao-quyet-dinh-theo-luc-luong-2026-08-20_16h15.xlsx` — tên tiếng Việt dễ hiểu, ngày giờ phân biệt rõ ràng. */
  private buildFileName(code: string): string {
    const slugs: Record<string, string> = {
      'dossier-throughput': 'luu-luong-ho-so-theo-ngay',
      'agency-processing-time': 'thoi-gian-xu-ly-theo-luc-luong',
      'agency-decision': 'quyet-dinh-theo-luc-luong',
      'gate-event': 'nhat-ky-qua-cong',
      'yard-occupancy': 'ton-bai-theo-khu',
    };
    const now = new Date();
    const pad = (value: number): string => String(value).padStart(2, '0');
    const slug = slugs[code] || code;
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}h${pad(now.getMinutes())}`;
    return `bao-cao-${slug}-${dateStr}_${timeStr}.xlsx`;
  }
}
