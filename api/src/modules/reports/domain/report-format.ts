/**
 * Định dạng giá trị cho tệp Excel xuất ra. Đặt ở `domain/` vì đây là quy ước trình bày của nghiệp
 * vụ (tiếng Việt, đơn vị thời gian), không phụ thuộc thư viện nào — nhờ vậy test được không cần
 * dựng workbook.
 */

/** Đổi số giây thành chuỗi đọc được: `2 giờ 15 phút`, `45 phút`, `30 giây`, `—`. */
export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
  if (minutes > 0) return `${minutes} phút`;
  return `${total} giây`;
}

/**
 * Mô tả bộ lọc đang áp dụng để ghi lên đầu tệp Excel — người nhận tệp phải đọc được tệp này
 * lọc theo gì, nếu không thì con số trong tệp không kiểm chứng lại được.
 */
export function describeFilter(filter: Record<string, string | undefined>, labels: Record<string, string>): string {
  const parts = Object.entries(filter)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([key, value]) => `${labels[key] ?? key}: ${value}`);
  return parts.length > 0 ? parts.join(' · ') : 'Không áp dụng bộ lọc';
}

/** Tên sheet hợp lệ của Excel: tối đa 31 ký tự, không chứa `[ ] : * ? / \`. */
export function toSheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').trim();
  return (cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned) || 'Bao cao';
}
