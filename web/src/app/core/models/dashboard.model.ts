// =============================================================================
// Mô hình Dashboard tổng quan (P5 — UI-02). Khớp contract `GET /dashboard/overview`.
//
// Ba nguyên tắc bắt buộc của màn hình này:
//   1. **Drill-down do API quyết định.** Mỗi KPI mang sẵn `drilldown { route, queryParams }`;
//      web điều hướng đúng cái đó, KHÔNG tự suy ra đường dẫn từ mã KPI — nếu tự suy thì con
//      số trên thẻ và danh sách mở ra sẽ lệch nhau (DoD mốc M3 yêu cầu khớp).
//   2. **Có sơ đồ TRẠNG THÁI "Tình hình cửa khẩu"** — quyết định A0 (bỏ panel này) đã được chủ
//      dự án ĐẢO NGƯỢC. Panel dựng từ dữ liệu thật (`gateYard`): tồn bãi theo khu, luồng cổng
//      hôm nay, số đang chờ hàng đợi. Vẫn **KHÔNG có bản đồ địa lý giả** — chỉ là trạng thái số.
//   3. **Không có cảnh báo SLA/quá hạn.** Dự án chốt không có ngưỡng SLA (điểm D5), nên web
//      chỉ hiển thị đúng `alerts[]` do API trả. Panel "Cần xử lý sớm" (`attention`) sắp hồ sơ
//      theo thời gian chờ THẬT ở bước hiện tại, KHÔNG tính ngưỡng, KHÔNG gọi là "quá hạn".
// =============================================================================

import { MessageKey } from '../i18n/message-catalog';
import { Translate, translateLabel } from './label.util';

/** Đích đến khi bấm vào một KPI — do API cấp, web chỉ việc điều hướng. */
export interface DashboardDrilldown {
  route: string;
  queryParams: Record<string, string>;
}

/** Sắc thái thẻ KPI, dùng lại đúng bảng màu trạng thái nghiệp vụ (SRS 8.1). */
export type DashboardKpiTone = 'idle' | 'processing' | 'done' | 'waiting' | 'rejected';

/**
 * Xu hướng "so với hôm qua" của một thẻ KPI. **Tùy chọn** — chỉ KPI so được theo ngày (mặc định là
 * "Tổng hồ sơ") mới có; KPI snapshot/tồn kho bỏ trống, web không vẽ mũi tên (không bịa xu hướng).
 */
export interface DashboardKpiTrend {
  today: number;
  yesterday: number;
  /** Phần trăm thay đổi so với hôm qua; `null` khi hôm qua = 0 (không chia được). */
  deltaPercent: number | null;
  direction: 'up' | 'down' | 'flat';
}

export interface DashboardKpi {
  key: string;
  label: string;
  value: number;
  unit?: string;
  tone?: DashboardKpiTone;
  drilldown: DashboardDrilldown;
  trend?: DashboardKpiTrend;
}

/** Một cột của biểu đồ theo giờ. */
export interface DashboardHourlyPoint {
  hour: string;
  submitted: number;
  passed: number;
}

/** Một dòng trạng thái theo lực lượng chuyên ngành. */
export interface DashboardForceRow {
  agencyCode: string;
  agencyName: string;
  waiting: number;
  processing: number;
  completed: number;
}

/** Một lát "cơ cấu hồ sơ theo luồng" — số hồ sơ theo mã loại (nhập/xuất/quá cảnh…). Nhãn tra qua i18n. */
export interface DashboardTypeSlice {
  type: string;
  count: number;
}

/** Một cột "lưu lượng theo ngày" — số hồ sơ gửi và hoàn tất trong ngày. */
export interface DashboardDailyPoint {
  date: string;
  submitted: number;
  completed: number;
}

export type DashboardAlertLevel = 'INFO' | 'WARN' | 'DANGER';

export interface DashboardAlert {
  level: DashboardAlertLevel;
  message: string;
  dossierId?: string;
  dossierCode?: string;
}

/** Một khu bãi trên sơ đồ "Tình hình cửa khẩu" — số ô đang có xe trên tổng số ô. */
export interface DashboardYard {
  yardName: string;
  occupied: number;
  slots: number;
}

/** Sơ đồ TRẠNG THÁI cửa khẩu (không phải bản đồ địa lý). `yards` rỗng với người dùng không có phạm vi ALL. */
export interface DashboardGateYard {
  yards: DashboardYard[];
  gatePassedToday: number;
  gateDeniedToday: number;
  queueWaiting: number;
}

/** Một dòng "Cần xử lý sớm" — hồ sơ chờ lâu nhất ở bước hiện tại. `waitingSince` là mốc vào bước THẬT. */
export interface DashboardAttentionItem {
  dossierId: string;
  dossierCode: string;
  /** Tên doanh nghiệp chủ hồ sơ; rỗng với hồ sơ cũ chưa gắn bảng doanh nghiệp. */
  enterpriseName: string;
  /** Mã loại hồ sơ (`EXPORT`/`IMPORT`…) — nhãn tra qua i18n. */
  type: string;
  stepLabel: string;
  waitingSince: string;
}

/**
 * `GET /dashboard/overview`.
 *
 * `gateYard`/`attention` để **tùy chọn** vì trang phải chịu được phản hồi thiếu trường (client cũ,
 * API cũ) mà không vỡ — component tự lùi về trạng thái rỗng thay vì lỗi.
 */
export interface DashboardOverview {
  generatedAt: string;
  kpis: DashboardKpi[];
  hourly: DashboardHourlyPoint[];
  /** Cơ cấu hồ sơ theo luồng (nhập/xuất/quá cảnh…). Tùy chọn để chịu được API cũ thiếu trường. */
  byType?: DashboardTypeSlice[];
  /** Lưu lượng theo ngày (N ngày gần nhất). Tùy chọn để chịu được API cũ thiếu trường. */
  daily?: DashboardDailyPoint[];
  byForce: DashboardForceRow[];
  alerts: DashboardAlert[];
  gateYard?: DashboardGateYard;
  attention?: DashboardAttentionItem[];
}

export interface DashboardFilters {
  checkpoint?: string;
  from?: string;
  to?: string;
}

/** Icon cho thẻ KPI — chọn theo sắc thái vì mã KPI do API đặt, web không biết trước. */
const KPI_ICONS: Record<string, string> = {
  idle: 'inventory_2',
  processing: 'autorenew',
  done: 'task_alt',
  waiting: 'hourglass_top',
  rejected: 'report',
};

export function kpiIcon(tone: string | undefined): string {
  return KPI_ICONS[tone || 'idle'] || KPI_ICONS['idle'];
}

export const ALERT_LEVEL_LABEL_KEYS: Record<string, MessageKey> = {
  INFO: 'ui.dashboard.alertINFO',
  WARN: 'ui.dashboard.alertWARN',
  DANGER: 'ui.dashboard.alertDANGER',
};

export const ALERT_LEVEL_TYPES: Record<string, 'info' | 'warning' | 'error'> = {
  INFO: 'info',
  WARN: 'warning',
  DANGER: 'error',
};

export function alertLevelLabel(level: string, t?: Translate): string {
  const key = ALERT_LEVEL_LABEL_KEYS[level];
  if (key) return translateLabel(key, t);
  // Mức lạ do API thêm mới thì hiện nguyên mã; không có mã nào thì coi như thông tin.
  return level || translateLabel('ui.dashboard.alertINFO', t);
}

export function alertLevelType(level: string): 'info' | 'warning' | 'error' {
  return ALERT_LEVEL_TYPES[level] || 'info';
}

/** Tổng cộng một cột của bảng theo lực lượng — dùng cho dòng tổng và mô tả biểu đồ. */
export function sumForce(rows: readonly DashboardForceRow[], key: 'waiting' | 'processing' | 'completed'): number {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}
