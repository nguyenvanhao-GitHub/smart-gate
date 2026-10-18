// =============================================================================
// Hiển thị thông báo (F06) dùng chung giữa chuông trên topbar và trang `/notifications`.
//
// Mã loại thông báo là **dữ liệu** (khớp `NotificationType` phía API); nơi hiển thị chỉ suy ra
// sắc thái màu, biểu tượng và nhóm thời gian từ mã đó — không so sánh chuỗi tiếng Việt để quyết
// định nghiệp vụ. Mã lạ do BE thêm mới rơi về sắc thái `info` và giữ nguyên mã làm nhãn.
// =============================================================================

import { Translate, translateCode } from './label.util';

/** Sắc thái hiển thị của một thông báo — quyết định màu và biểu tượng. */
export type NotifTone = 'info' | 'warn' | 'danger' | 'success' | 'system';

/** Mã loại (khớp `notification-type.enum.ts` phía API) → sắc thái; mã lạ rơi về `info`. */
const TONE_BY_TYPE: Record<string, NotifTone> = {
  DOSSIER_SUPPLEMENT_REQUESTED: 'warn',
  DOSSIER_REJECTED: 'danger',
  DOSSIER_STATUS_CHANGED: 'info',
  DOSSIER_STEP_CONFIRMED: 'success',
  DOSSIER_TURN_PROCESSING: 'info',
  SYSTEM: 'system',
  USER_REGISTERED: 'info',
};

/** Biểu tượng Material theo sắc thái (cảnh báo / lỗi / thành công / hệ thống / thông tin). */
const ICON_BY_TONE: Record<NotifTone, string> = {
  info: 'info',
  warn: 'warning',
  danger: 'report',
  success: 'check_circle',
  system: 'settings',
};

/** Nhãn i18n theo mã loại — dùng cho thẻ loại; mã lạ giữ nguyên mã. */
const LABEL_KEY_BY_TYPE = {
  DOSSIER_SUPPLEMENT_REQUESTED: 'ui.notify.typeSupplement',
  DOSSIER_REJECTED: 'ui.notify.typeRejected',
  DOSSIER_STATUS_CHANGED: 'ui.notify.typeStatusChanged',
  DOSSIER_STEP_CONFIRMED: 'ui.notify.typeStepConfirmed',
  DOSSIER_TURN_PROCESSING: 'ui.notify.typeTurnProcessing',
  SYSTEM: 'ui.notify.typeSystem',
  USER_REGISTERED: 'ui.notify.typeUserRegistered',
} as const;

/** Sắc thái suy từ mã loại; dùng cho màu ô biểu tượng. */
export function notifTone(type: string): NotifTone {
  return TONE_BY_TYPE[type] ?? 'info';
}

/** Biểu tượng suy từ mã loại (qua sắc thái). */
export function notifIcon(type: string): string {
  return ICON_BY_TONE[notifTone(type)];
}

/** Nhãn loại đã dịch; mã lạ trả về chính mã (không lộ khóa trần). */
export function notifTypeLabel(type: string, t?: Translate): string {
  return translateCode(LABEL_KEY_BY_TYPE[type as keyof typeof LABEL_KEY_BY_TYPE], type, t);
}

/** Regex kiểm tra tiêu đề/nội dung thông báo liên quan đến thao tác điều phối xe (SG-227). */
const DISPATCH_NOTIF_REGEX = /dieu phoi|cho dieu phoi|goi xe|điều phối|chờ điều phối|gọi xe/i;

/** Đường dẫn điều hướng của một thông báo (SG-227). */
export function notifRoute(item: { route?: string | null; title?: string | null; content?: string | null; type?: string | null; dossierId?: string | null }): string | null {
  if (item.route) {
    if (item.route === '/dispatch') {
      return '/operations/vehicle-confirmation';
    }
    return item.route;
  }

  const title = item.title || '';
  const content = item.content || '';
  const type = (item.type || '').toLowerCase();

  if (
    type.includes('dispatch') ||
    DISPATCH_NOTIF_REGEX.test(title) ||
    DISPATCH_NOTIF_REGEX.test(content)
  ) {
    return '/operations/vehicle-confirmation';
  }

  if (item.dossierId) return `/declarations/${item.dossierId}`;
  return null;
}

/** Nhóm thời gian của một thông báo — mã ASCII, nhãn tra qua i18n ở nơi hiển thị. */
export type NotifTimeGroup = 'today' | 'yesterday' | 'earlier';

/** Khóa nhãn i18n cho từng nhóm thời gian. */
export const NOTIF_TIME_GROUP_LABEL_KEYS: Record<NotifTimeGroup, string> = {
  today: 'ui.notify.groupToday',
  yesterday: 'ui.notify.groupYesterday',
  earlier: 'ui.notify.groupEarlier',
};

/** Thứ tự cố định các nhóm thời gian khi hiển thị (mới nhất trước). */
const TIME_GROUP_ORDER: NotifTimeGroup[] = ['today', 'yesterday', 'earlier'];

/** Số ngày lịch (theo giờ địa phương) giữa thời điểm tạo và mốc hiện tại. */
function calendarDaysAgo(createdAt: string, now: Date): number {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return Number.POSITIVE_INFINITY;
  const startOfCreated = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((startOfNow.getTime() - startOfCreated.getTime()) / 86_400_000);
}

/** Nhóm thời gian của một mốc tạo: hôm nay / hôm qua / trước đó (tương lai coi như hôm nay). */
export function notifTimeGroup(createdAt: string, now: Date = new Date()): NotifTimeGroup {
  const days = calendarDaysAgo(createdAt, now);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return 'earlier';
}

/**
 * Thời gian tương đối của một thông báo (BUG-087): khóa i18n + số lượng để nội suy.
 * Khóa là ASCII, nhãn tra qua i18n ở nơi hiển thị — không nhúng chuỗi tiếng Việt vào model.
 * Quá 7 ngày (hoặc mốc không hợp lệ) trả `null` để nơi hiển thị rơi về ngày giờ tuyệt đối.
 */
export interface NotifRelativeTime {
  key: string;
  params?: { count: number };
}

/** Suy thời gian tương đối "x phút/giờ/ngày trước"; tương lai gần và <60s đều coi là "Vừa xong". */
export function notifRelativeTime(createdAt: string, now: Date = new Date()): NotifRelativeTime | null {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return null;
  const diffSec = Math.floor((now.getTime() - created) / 1000);
  if (diffSec < 60) return { key: 'ui.notify.relJustNow' };
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return { key: 'ui.notify.relMinutes', params: { count: diffMin } };
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return { key: 'ui.notify.relHours', params: { count: diffHour } };
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return { key: 'ui.notify.relDays', params: { count: diffDay } };
  return null;
}

/** Một nhóm thông báo cùng mốc thời gian, giữ nguyên thứ tự phần tử đầu vào. */
export interface NotifTimeSection<T> {
  key: NotifTimeGroup;
  labelKey: string;
  items: T[];
}

/** Gom danh sách thành các nhóm thời gian không rỗng, theo thứ tự hôm nay → trước đó. */
export function groupByTime<T extends { createdAt: string }>(
  items: readonly T[],
  now: Date = new Date(),
): NotifTimeSection<T>[] {
  return TIME_GROUP_ORDER.map((key) => ({
    key,
    labelKey: NOTIF_TIME_GROUP_LABEL_KEYS[key],
    items: items.filter((item) => notifTimeGroup(item.createdAt, now) === key),
  })).filter((section) => section.items.length > 0);
}

/**
 * Định dạng nội dung thông báo gọi xe (SG-216):
 * Tự động chuyển đổi số thứ tự thô `(Số thứ tự 1)` thành mã định dạng chuẩn `(Số thứ tự 21/08/2026.0001)`.
 */
export function formatNotificationContent(content: string, createdAt?: string): string {
  if (!content) return '';
  return content.replace(/\(Số thứ tự (\d+)\)/g, (match, numStr) => {
    const num = Number(numStr);
    if (Number.isNaN(num)) return match;
    const date = createdAt ? new Date(createdAt) : new Date();
    if (Number.isNaN(date.getTime())) return match;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const formattedNum = String(num).padStart(4, '0');
    return `(Số thứ tự ${day}/${month}/${year}.${formattedNum})`;
  });
}
