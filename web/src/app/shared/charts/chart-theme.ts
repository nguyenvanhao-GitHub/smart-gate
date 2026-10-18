// =============================================================================
// Màu và kiểu chữ cho biểu đồ — **lấy từ design token**, không hard-code.
//
// ECharts có bảng màu mặc định riêng; nếu dùng nó thì biểu đồ sẽ lệch tông với
// phần còn lại của hệ thống và mỗi lần đổi token lại phải sửa tay từng biểu đồ.
// Ở đây đọc thẳng biến CSS `--sg-*` trong `_tokens.scss` lúc chạy.
// =============================================================================

/** Đọc một biến CSS ở `:root`. Trả chuỗi rỗng khi chưa nạp được style (ví dụ lúc test). */
export function readToken(name: string): string {
  if (typeof window === 'undefined' || !window.getComputedStyle) return '';
  return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Đọc biến CSS dạng `14px` thành số. Trả `fallback` khi không đọc được. */
export function readTokenSize(name: string, fallback: number): number {
  const value = parseFloat(readToken(name));
  return Number.isFinite(value) ? value : fallback;
}

export interface SgChartTheme {
  /** Bảng màu chuỗi số liệu, theo thứ tự ưu tiên. Rỗng ⇒ để ECharts dùng mặc định. */
  palette: string[];
  text: string;
  muted: string;
  line: string;
  fontFamily: string;
  fontSize: number;
}

/**
 * Bảng màu theo **màu trạng thái nghiệp vụ** (SRS 8.1): đang xử lý → xanh dương,
 * hoàn thành → xanh lá, chờ → vàng, từ chối → đỏ, chưa đến lượt → xám.
 */
export function chartTheme(): SgChartTheme {
  const palette = [
    readToken('--sg-state-processing'),
    readToken('--sg-state-done'),
    readToken('--sg-state-waiting'),
    readToken('--sg-state-rejected'),
    readToken('--sg-teal-600'),
    readToken('--sg-state-idle'),
  ].filter((color) => !!color);

  return {
    palette,
    text: readToken('--sg-text'),
    muted: readToken('--sg-text-muted'),
    line: readToken('--sg-border'),
    fontFamily: readToken('--sg-font-family') || "'Inter', 'Segoe UI', system-ui, sans-serif",
    fontSize: readTokenSize('--sg-small-size', 12),
  };
}

/** Màu ứng với một sắc thái trạng thái — dùng khi chuỗi số liệu có ý nghĩa cố định. */
export function toneColor(tone: string): string {
  const map: Record<string, string> = {
    processing: '--sg-state-processing',
    done: '--sg-state-done',
    waiting: '--sg-state-waiting',
    rejected: '--sg-state-rejected',
    idle: '--sg-state-idle',
  };
  return readToken(map[tone] || '--sg-state-idle');
}
