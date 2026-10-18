// =============================================================================
// Mô hình Báo cáo — thống kê (P5 — UI-12). Khớp contract `/reports/*`.
//
// Hai nguyên tắc bắt buộc:
//   1. **Danh sách báo cáo và bộ lọc do API trả** (`GET /reports/catalog`) — biểu mẫu lọc
//      dựng động từ `filters[]`, web KHÔNG hard-code tên báo cáo hay ô lọc nào.
//   2. **Chỉ xuất Excel** (F58). Không có xuất PDF — đã loại khỏi phạm vi bởi quyết định A0.
// =============================================================================

import { Translate, translateLabel } from './label.util';

export type ReportFilterType = 'date' | 'select' | 'text';

export interface ReportFilterOption {
  value: string;
  label: string;
}

/** Một ô lọc do API mô tả — web dựng control tương ứng với `type`. */
export interface ReportFilterDefinition {
  key: string;
  label: string;
  type: ReportFilterType;
  options?: ReportFilterOption[];
}

/** Một báo cáo trong danh mục `GET /reports/catalog`. */
export interface ReportDefinition {
  code: string;
  name: string;
  group: string;
  description: string;
  filters: ReportFilterDefinition[];
}

export type ReportColumnType = 'text' | 'number' | 'date' | 'duration';

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
}

/** Một dòng dữ liệu báo cáo — khóa theo `columns[].key`. */
export type ReportRow = Record<string, unknown>;

/** Thân yêu cầu của `POST /reports/:code/query` và `/export` — **giống hệt nhau**. */
export interface ReportQuery {
  from?: string;
  to?: string;
  checkpoint?: string;
  type?: string;
  status?: string;
  agencyCode?: string;
  page?: number;
  pageSize?: number;
  [key: string]: string | number | undefined;
}

/** Kết quả `POST /reports/:code/query`. */
export interface ReportResult {
  code: string;
  name: string;
  generatedAt: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  total: number;
  page: number;
  pageSize: number;
  summary?: Record<string, number>;
  /** Danh sách nguồn sinh ra số liệu — do API cấp, web không tự suy ra. */
  drilldown?: { route: string; queryParams: Record<string, string> };
}

/** Nhóm báo cáo để đổ vào ô chọn — giữ nguyên thứ tự API trả. */
export interface ReportGroupView {
  group: string;
  reports: ReportDefinition[];
}

export function groupReports(reports: readonly ReportDefinition[], t?: Translate): ReportGroupView[] {
  const groups: ReportGroupView[] = [];
  reports.forEach((report) => {
    // Tên nhóm là **dữ liệu do API cấp** — chỉ nhóm "không tên" mới dùng nhãn của giao diện.
    const name = report.group || translateLabel('ui.report.groupOther', t);
    const found = groups.find((item) => item.group === name);
    if (found) found.reports.push(report);
    else groups.push({ group: name, reports: [report] });
  });
  return groups;
}

/**
 * Chọn báo cáo mở đầu theo tham số đường dẫn `/reports/:group`.
 * Ưu tiên khớp **mã báo cáo**, sau đó tới **tên nhóm** (so sánh dạng slug không dấu),
 * cuối cùng rơi về báo cáo đầu tiên của danh mục.
 */
export function pickReportForRoute(reports: readonly ReportDefinition[], routeParam: string): ReportDefinition | null {
  if (!reports.length) return null;
  const slug = toSlug(routeParam);
  if (slug) {
    const byCode = reports.find((report) => toSlug(report.code) === slug);
    if (byCode) return byCode;
    const byGroup = reports.find((report) => toSlug(report.group) === slug);
    if (byGroup) return byGroup;
  }
  return reports[0];
}

/** `Báo cáo, thống kê` -> `bao-cao-thong-ke` (bỏ dấu tiếng Việt để so khớp được với url). */
export function toSlug(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Bỏ ô lọc rỗng để không gửi tham số thừa lên API. */
export function cleanFilterValues(values: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  Object.entries(values || {}).forEach(([key, value]) => {
    const text = (value ?? '').toString().trim();
    if (text) result[key] = text;
  });
  return result;
}

const NUMBER_FORMAT = new Intl.NumberFormat('vi-VN');

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Chuỗi hóa một ô báo cáo. Ô là JSON tự do do API trả (`ReportRow` = `Record<string, unknown>`)
 * nên không có cách nào ngoài `String()`.
 *
 * ⚠️ Hạn chế đã biết (lint `no-base-to-string` chỉ ra): ô mang **kiểu đối tượng** sẽ hiện
 * `[object Object]`. Hiện chưa báo cáo nào trả ô như vậy; sửa cho tử tế là đổi cách hiển thị của
 * bảng báo cáo — một thay đổi giao diện có chủ đích, không gộp vào lượt dựng lint.
 */
function cellText(value: unknown): string {
  return String(value);
}

/** Hiển thị một ô dữ liệu theo kiểu cột API khai báo. */
export function formatReportCell(value: unknown, type: ReportColumnType, t?: Translate): string {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'number') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? NUMBER_FORMAT.format(numeric) : cellText(value);
  }
  if (type === 'duration') return formatDuration(value, t);
  if (type === 'date') {
    const time = new Date(cellText(value));
    return Number.isNaN(time.getTime()) ? cellText(value) : DATE_TIME_FORMAT.format(time);
  }
  return cellText(value);
}

/** Thời lượng tính bằng **giây** — cùng quy ước với `formatElapsed` của hàng đợi liên ngành. */
export function formatDuration(value: unknown, t?: Translate): string {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  if (!total) return translateLabel('ui.duration.minutes', t, { value: 0 });
  if (total < 60) return translateLabel('ui.duration.seconds', t, { value: total });
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return translateLabel('ui.duration.minutes', t, { value: minutes });
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return translateLabel('ui.duration.hoursMinutes', t, { hours, minutes: remMinutes });
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (remMinutes > 0) {
    return translateLabel('ui.duration.daysHoursMinutes', t, { days, hours: remHours, minutes: remMinutes });
  }
  return translateLabel('ui.duration.daysHours', t, { days, hours: remHours });
}

/** Cột phân loại của biểu đồ = cột `date`/`text` đầu tiên. */
export function categoryColumn(columns: readonly ReportColumn[]): ReportColumn | null {
  return columns.find((column) => column.type === 'date' || column.type === 'text') || null;
}

/** Chuỗi số liệu của biểu đồ = các cột `number`/`duration`. */
export function seriesColumns(columns: readonly ReportColumn[]): ReportColumn[] {
  return columns.filter((column) => column.type === 'number' || column.type === 'duration');
}

/** Dựng dữ liệu chuỗi số liệu tự động bằng cách đếm số bản ghi theo danh mục khi báo cáo không có cột số. */
export function buildCountSeriesFromRows(
  rows: readonly ReportRow[],
  categoryColumn: ReportColumn,
  t?: Translate,
): { categoryData: string[]; seriesData: number[]; tableRows: (string | number)[][] } {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const rawVal = row[categoryColumn.key];
    let key = '';
    if (categoryColumn.type === 'date' && rawVal) {
      const timeStr = typeof rawVal === 'string' || typeof rawVal === 'number' ? String(rawVal) : '';
      const d = new Date(timeStr);
      if (!Number.isNaN(d.getTime())) {
        const pad = (v: number) => String(v).padStart(2, '0');
        key = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
      } else {
        key = formatReportCell(rawVal, categoryColumn.type, t);
      }
    } else {
      key = formatReportCell(rawVal, categoryColumn.type, t);
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const categoryData = Array.from(counts.keys());
  const seriesData = Array.from(counts.values());
  const tableRows = Array.from(counts.entries()).map(([cat, count]) => [cat, count]);
  return { categoryData, seriesData, tableRows };
}

/** Tên tệp Excel tải về — có tiền tố bao-cao-, mã tiếng Việt và mốc ngày giờ phân biệt rõ ràng (SG-179). */
export function exportFileName(code: string, now: Date = new Date()): string {
  const slugs: Record<string, string> = {
    'dossier-throughput': 'luu-luong-ho-so-theo-ngay',
    'agency-processing-time': 'thoi-gian-xu-ly-theo-luc-luong',
    'agency-decision': 'quyet-dinh-theo-luc-luong',
    'gate-event': 'nhat-ky-qua-cong',
    'yard-occupancy': 'ton-bai-theo-khu',
  };
  const pad = (value: number) => String(value).padStart(2, '0');
  const slug = slugs[code] || toSlug(code) || 'tong-hop';
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}h${pad(now.getMinutes())}`;
  return `bao-cao-${slug}-${dateStr}_${timeStr}.xlsx`;
}
