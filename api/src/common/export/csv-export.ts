import { vietnamDateString, vietnamTimeString } from '../time/vietnam-date';

/**
 * Tiện ích xuất CSV dùng chung cho mọi màn có nút "Xuất" (nhật ký F58, đối soát phí F51). Xuất
 * **ở máy chủ** thay vì sinh tệp tại trình duyệt: đi qua kiểm quyền, đọc đúng dữ liệu thật và ghi
 * được nhật ký ai xuất, lúc nào (BUG-027, BUG-028).
 *
 * TypeScript thuần, không phụ thuộc framework — use-case nào cần cũng gọi được.
 */

/** BOM UTF-8 để Excel mở tệp nhận đúng tiếng Việt có dấu. */
const UTF8_BOM = '﻿';

export type CsvCell = string | number | null | undefined;

export interface CsvExportResult {
  fileName: string;
  content: Buffer;
  rowCount: number;
}

/** Bọc một ô CSV: luôn đặt trong dấu nháy kép và nhân đôi dấu nháy bên trong (RFC 4180). */
function escapeCell(value: CsvCell): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/** Dựng nội dung CSV (kèm BOM, kết dòng CRLF) từ tiêu đề và các dòng dữ liệu. */
export function buildCsv(headers: readonly string[], rows: ReadonlyArray<readonly CsvCell[]>): Buffer {
  const lines = [headers, ...rows].map((cells) => cells.map(escapeCell).join(','));
  return Buffer.from(UTF8_BOM + lines.join('\r\n'), 'utf-8');
}

/**
 * Tên tệp có **mốc thời gian giờ VN** để không đè tệp cũ và ghi lại được thời điểm xuất:
 * `nhat-ky-he-thong-20260802-1435.csv`.
 */
export function csvFileName(prefix: string): string {
  const stamp = `${vietnamDateString().replace(/-/g, '')}-${vietnamTimeString().replace(':', '')}`;
  return `${prefix}-${stamp}.csv`;
}
