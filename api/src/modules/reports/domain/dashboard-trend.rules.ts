/**
 * Quy tắc tính xu hướng "so với hôm qua" cho thẻ KPI của dashboard (UI-02).
 *
 * ⚠️ Chỉ so được cho KPI là **luồng theo ngày tạo hồ sơ** (đánh dấu `trendComparable` trong
 * `dashboard-kpi.catalog.ts`). KPI dạng tồn kho/snapshot (đang chờ, đang xử lý…) không có mốc
 * "hôm qua" hợp lý nên **không gắn trend** — xem lý do ở catalog.
 *
 * Cửa sổ so sánh là "đến cùng thời điểm": hôm nay tính từ 0h đến hiện tại, hôm qua tính từ 0h hôm
 * qua đến đúng thời điểm này của hôm qua. So như vậy công bằng (nửa ngày với nửa ngày), không bị
 * lệch do hôm nay mới chạy được một phần.
 */

export interface DayComparisonWindow {
  /** Đầu ngày hôm nay (0h theo giờ máy chủ). */
  todayFrom: Date;
  /** Thời điểm hiện tại. */
  todayTo: Date;
  /** Đầu ngày hôm qua (0h). */
  yesterdayFrom: Date;
  /** Cùng thời điểm này nhưng của hôm qua. */
  yesterdayTo: Date;
}

/** Dựng hai khung thời gian "đến hiện tại" của hôm nay và hôm qua từ mốc `now`. */
export function dayComparisonWindows(now: Date): DayComparisonWindow {
  const todayFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const yesterdayFrom = new Date(todayFrom);
  yesterdayFrom.setDate(yesterdayFrom.getDate() - 1);
  const yesterdayTo = new Date(now);
  yesterdayTo.setDate(yesterdayTo.getDate() - 1);
  return { todayFrom, todayTo: now, yesterdayFrom, yesterdayTo };
}

export type TrendDirection = 'up' | 'down' | 'flat';

export interface KpiTrend {
  today: number;
  yesterday: number;
  /** Phần trăm thay đổi so với hôm qua (đã làm tròn). `null` khi hôm qua = 0 vì không chia được. */
  deltaPercent: number | null;
  direction: TrendDirection;
}

/** So hai con số hôm nay/hôm qua thành xu hướng. Không bịa %: hôm qua = 0 thì `deltaPercent = null`. */
export function computeTrend(today: number, yesterday: number): KpiTrend {
  const direction: TrendDirection = today > yesterday ? 'up' : today < yesterday ? 'down' : 'flat';
  const deltaPercent = yesterday === 0 ? null : Math.round(((today - yesterday) / yesterday) * 100);
  return { today, yesterday, deltaPercent, direction };
}
