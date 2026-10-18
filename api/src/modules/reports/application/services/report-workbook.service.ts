import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { toText } from '../../../../common/text/to-text';
import { ReportFilter } from '../../domain/report-filter';
import { describeFilter, formatDurationSeconds, toSheetName } from '../../domain/report-format';
import { ReportColumnDefinition } from '../../domain/report.catalog';
import { ReportResultView } from '../dto/report-view.dto';

/** Nhãn tiếng Việt của khóa lọc, dùng cho dòng mô tả ở đầu tệp. */
const FILTER_LABELS: Record<string, string> = {
  from: 'Từ ngày',
  to: 'Đến ngày',
  checkpoint: 'Chốt',
  type: 'Loại hình',
  status: 'Trạng thái',
  agencyCode: 'Lực lượng',
};

export interface ReportWorkbookInput {
  result: ReportResultView;
  filter: ReportFilter;
  actorName: string;
  /** True khi số dòng chạm trần xuất — phải ghi lên tệp để người đọc biết dữ liệu bị cắt. */
  truncated: boolean;
}

/**
 * Dựng tệp `.xlsx` cho một báo cáo (F58 — điểm C4 đã chốt làm ở backend).
 *
 * Tệp luôn mở đầu bằng **tên báo cáo, thời điểm xuất, người xuất và bộ lọc đã áp dụng**. Không có
 * khối này thì con số trong tệp không kiểm chứng lại được, mà nghiệm thu M3 lại yêu cầu số liệu
 * truy ngược được về danh sách nguồn.
 */
@Injectable()
export class ReportWorkbookService {
  async build(input: ReportWorkbookInput): Promise<Buffer> {
    const { result, filter, actorName, truncated } = input;
    const workbook = new Workbook();
    workbook.creator = 'Smart Gate';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(toSheetName(result.name));
    const columnCount = Math.max(1, result.columns.length);

    this.addTitleBlock(sheet, result, filter, actorName, truncated, columnCount);
    this.addHeaderRow(sheet, result.columns);
    result.rows.forEach((row) => {
      sheet.addRow(result.columns.map((column) => this.toCellValue(column, row[column.key])));
    });

    result.columns.forEach((column, index) => {
      sheet.getColumn(index + 1).width = column.type === 'date' ? 20 : Math.max(14, column.label.length + 4);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private addTitleBlock(
    sheet: ReturnType<Workbook['addWorksheet']>,
    result: ReportResultView,
    filter: ReportFilter,
    actorName: string,
    truncated: boolean,
    columnCount: number,
  ): void {
    const title = sheet.addRow([result.name]);
    title.font = { bold: true, size: 14 };
    sheet.mergeCells(title.number, 1, title.number, columnCount);

    sheet.addRow([`Thời điểm xuất: ${new Date(result.generatedAt).toLocaleString('vi-VN')} · Người xuất: ${actorName}`]);
    sheet.addRow([`Bộ lọc — ${describeFilter(filter as Record<string, string | undefined>, FILTER_LABELS)}`]);
    sheet.addRow([`Tổng số dòng khớp bộ lọc: ${result.total}`]);
    if (truncated) {
      sheet.addRow(['⚠ Tệp đã bị cắt bớt do vượt trần số dòng cho phép xuất. Hãy thu hẹp bộ lọc.']);
    }
    sheet.addRow([]);
  }

  private addHeaderRow(sheet: ReturnType<Workbook['addWorksheet']>, columns: ReportColumnDefinition[]): void {
    const header = sheet.addRow(columns.map((column) => column.label));
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3E9F1' } };
    });
  }

  private toCellValue(column: ReportColumnDefinition, value: unknown): string | number | Date | null {
    if (value === null || value === undefined || value === '') return column.type === 'number' ? 0 : '';
    if (column.type === 'duration') return formatDurationSeconds(Number(value));
    if (column.type === 'number') return Number(value);
    if (column.type === 'date') {
      const date = value instanceof Date ? value : new Date(toText(value));
      return Number.isNaN(date.getTime()) ? toText(value) : date;
    }
    return toText(value);
  }
}
