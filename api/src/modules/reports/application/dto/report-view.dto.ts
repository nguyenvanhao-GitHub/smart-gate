import { ReportColumnDefinition, ReportFilterDefinition } from '../../domain/report.catalog';
import { ReportDrilldown } from '../../domain/report-drilldown.rules';
import { DashboardKpiTone } from '../../domain/dashboard-kpi.catalog';

/** Một mục trong danh mục báo cáo — `GET /reports/catalog`. */
export interface ReportCatalogView {
  code: string;
  name: string;
  group: string;
  description: string;
  filters: ReportFilterDefinition[];
}

/** Kết quả chạy báo cáo — `POST /reports/:code/query`. */
export interface ReportResultView {
  code: string;
  name: string;
  generatedAt: string;
  columns: ReportColumnDefinition[];
  rows: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  /**
   * Các con số tổng của cả kỳ, không phụ thuộc trang đang xem.
   * Khóa `dossiers` (nếu có) là **con số đối chiếu với `drilldown`**: mở danh sách nguồn với
   * `drilldown.queryParams` thì số dòng bằng đúng `summary.dossiers`.
   */
  summary?: Record<string, number>;
  /**
   * Chỉ có ở báo cáo quy được về **một danh sách nguồn cụ thể**. Báo cáo tổng hợp không quy được
   * (nhật ký cổng, tồn bãi, thống kê theo lực lượng) thì bỏ trống — thà không có liên kết còn hơn
   * có liên kết mở ra con số khác.
   */
  drilldown?: ReportDrilldown;
}

/**
 * Xu hướng "so với hôm qua" của một thẻ KPI. **Tùy chọn** — chỉ KPI là luồng theo ngày tạo hồ sơ
 * mới có (xem `dashboard-kpi.catalog.ts`), còn KPI snapshot/tồn kho thì bỏ trống, không bịa số.
 */
export interface DashboardKpiTrendView {
  today: number;
  yesterday: number;
  /** Phần trăm thay đổi so với hôm qua (đã làm tròn). `null` khi hôm qua = 0 (không chia được). */
  deltaPercent: number | null;
  direction: 'up' | 'down' | 'flat';
}

export interface DashboardKpiView {
  key: string;
  label: string;
  value: number;
  unit: string;
  tone: DashboardKpiTone;
  drilldown: ReportDrilldown;
  /** Chỉ có ở KPI so được theo ngày (mặc định chỉ `total`). Không có thì FE không vẽ mũi tên. */
  trend?: DashboardKpiTrendView;
}

export interface DashboardHourlyView {
  /** `07:00` — giờ theo múi giờ của máy chủ database. */
  hour: string;
  submitted: number;
  passed: number;
}

export interface DashboardAgencyView {
  agencyCode: string;
  agencyName: string;
  waiting: number;
  processing: number;
  completed: number;
}

export type DashboardAlertLevel = 'INFO' | 'WARN' | 'DANGER';

export interface DashboardAlertView {
  level: DashboardAlertLevel;
  message: string;
  dossierId?: string;
  dossierCode?: string;
}

/** Một khu bãi trên panel "Tình hình cửa khẩu" — chỉ số ô đang có xe trên tổng số ô. */
export interface DashboardYardView {
  yardName: string;
  occupied: number;
  slots: number;
}

/**
 * Sơ đồ **trạng thái** cửa khẩu (không phải bản đồ địa lý): tồn bãi theo khu + luồng cổng hôm nay +
 * số đang chờ hàng đợi. `yards` chỉ có với người dùng phạm vi ALL (số liệu hạ tầng chung).
 */
export interface DashboardGateYardView {
  yards: DashboardYardView[];
  gatePassedToday: number;
  gateDeniedToday: number;
  queueWaiting: number;
}

/**
 * Một dòng của panel "Cần xử lý sớm" — hồ sơ đang chờ lâu nhất ở bước hiện tại. **Không** có ngưỡng
 * SLA/quá hạn: chỉ có `waitingSince` là mốc vào bước thật, web tự trình bày thời gian đã chờ.
 */
export interface DashboardAttentionView {
  dossierId: string;
  dossierCode: string;
  /** Tên doanh nghiệp chủ hồ sơ; rỗng với hồ sơ cũ chưa gắn bảng `enterprises`. */
  enterpriseName: string;
  /** Mã loại hồ sơ (`EXPORT`/`IMPORT`…) — nhãn do web tra qua i18n, không dịch ở BE. */
  type: string;
  stepLabel: string;
  /** Thời điểm hồ sơ vào bước hiện tại, ISO 8601. */
  waitingSince: string;
}

/**
 * Một lát "cơ cấu hồ sơ theo luồng" — số hồ sơ theo mã loại (nhập/xuất/quá cảnh/xe tự hành). Nhãn
 * do web tra qua i18n theo `type`, **không** dịch ở BE (mã là dữ liệu, chữ hiển thị là bản dịch).
 */
export interface DashboardTypeSliceView {
  type: string;
  count: number;
}

/**
 * Một cột "lưu lượng theo ngày" — hồ sơ gửi và hoàn tất trong ngày, cho N ngày gần nhất có phát sinh.
 * Chỉ trình bày số THẬT theo ngày tạo hồ sơ; không suy diễn, không lấp ngày trống.
 */
export interface DashboardDailyView {
  /** `YYYY-MM-DD` theo múi giờ của máy chủ database. */
  date: string;
  submitted: number;
  completed: number;
}

export interface DashboardOverviewView {
  generatedAt: string;
  kpis: DashboardKpiView[];
  hourly: DashboardHourlyView[];
  /** Cơ cấu hồ sơ theo luồng (nhập/xuất/quá cảnh…) trong kỳ. */
  byType: DashboardTypeSliceView[];
  /** Lưu lượng theo ngày (N ngày gần nhất có phát sinh) trong kỳ. */
  daily: DashboardDailyView[];
  byForce: DashboardAgencyView[];
  alerts: DashboardAlertView[];
  gateYard: DashboardGateYardView;
  attention: DashboardAttentionView[];
}
