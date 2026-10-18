import { ReportFilter } from './report-filter';

/**
 * Đường dẫn màn hình web + bộ lọc để mở đúng danh sách đã sinh ra con số.
 * `route` là đường dẫn của `web/src/app/app.routes.ts`, `queryParams` là query string của màn đó.
 */
export interface ReportDrilldown {
  route: string;
  queryParams: Record<string, string>;
}

/** Màn hình danh sách hồ sơ (UI-03). */
export const DOSSIER_LIST_ROUTE = '/declarations';

/** Màn kiểm soát cổng vào/ra (UI-09) — đích truy ngược của KPI đo lượt xe qua cổng. */
export const GATE_LOG_ROUTE = '/operations/vehicles-entered-gate';

/** Màn hình hàng đợi Xử lý liên ngành (UI-07 / SG-195). */
export const WORKFLOW_QUEUE_ROUTE = '/workflow/queue';

/** Màn hình Sơ đồ bãi (UI-10 / P4 / SG-197). */
export const YARD_MAP_ROUTE = '/operations/customs-b5';

/**
 * Các khóa mà **API danh sách hồ sơ thật sự nhận**. `ValidationPipe` bật `forbidNonWhitelisted`
 * nên gửi thừa một khóa lạ là 400 — danh sách này chính là `ListDeclarationsQuery`.
 */
const DOSSIER_LIST_KEYS = ['from', 'to', 'checkpoint', 'type', 'status', 'statusGroup'] as const;

type DossierListKey = (typeof DOSSIER_LIST_KEYS)[number];

/**
 * Dựng liên kết truy ngược về danh sách hồ sơ.
 *
 * Giá trị rỗng bị loại bỏ để query string không chứa `status=` trống — với API danh sách,
 * `status=` rỗng sẽ trượt `@IsEnum` và trả 400.
 */
export function dossierDrilldown(
  filter: ReportFilter,
  override: Partial<Record<DossierListKey, string | undefined>> = {},
): ReportDrilldown {
  const merged: Record<string, string | undefined> = { ...filter, ...override };
  const queryParams: Record<string, string> = {};
  DOSSIER_LIST_KEYS.forEach((key) => {
    const value = merged[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      queryParams[key] = String(value);
    }
  });
  return { route: DOSSIER_LIST_ROUTE, queryParams };
}

/**
 * Truy ngược cho KPI/báo cáo Cổng (SG-196): mở màn Cổng vào/ra.
 * Kèm theo các tham số bộ lọc (from, to, direction, decision...) nếu có để đồng bộ bộ lọc nhật ký.
 */
export function gateExitDrilldown(
  filter?: ReportFilter,
  override: { direction?: string; decision?: string } = {},
): ReportDrilldown {
  const queryParams: Record<string, string> = {};
  if (filter?.from) queryParams['from'] = filter.from;
  if (filter?.to) queryParams['to'] = filter.to;
  if (override.direction) queryParams['direction'] = override.direction;
  if (override.decision) queryParams['decision'] = override.decision;
  return { route: GATE_LOG_ROUTE, queryParams };
}

/**
 * Truy ngược cho báo cáo Liên ngành (SG-195): mở màn Xử lý liên ngành.
 */
export function workflowQueueDrilldown(): ReportDrilldown {
  return { route: WORKFLOW_QUEUE_ROUTE, queryParams: {} };
}

/**
 * Truy ngược cho báo cáo Kho bãi (SG-197): mở màn Kho bãi >> Sơ đồ bãi.
 */
export function yardMapDrilldown(): ReportDrilldown {
  return { route: YARD_MAP_ROUTE, queryParams: {} };
}
