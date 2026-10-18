// =============================================================================
// Mô hình kho bãi (P4 — UI-10). Khớp contract API `/yards`.
//
// Quy tắc nghiệp vụ (F42–F44): **1 vị trí = 1 xe**. Ô đỗ có bốn nhóm trạng thái
// hiển thị: `FREE` (trống) / `OCCUPIED` (đang dùng) / `OVERDUE` (đang dùng nhưng
// quá hạn lưu bãi) / `MAINTENANCE` (bị khoá). BE trả `status` = FREE/OCCUPIED/
// MAINTENANCE kèm cờ `overdue`; web suy ra trạng thái hiển thị OVERDUE để tô màu.
// =============================================================================

import { MessageKey } from '../i18n/message-catalog';
import { Translate, translateCode } from './label.util';

export type YardSlotStatus = 'FREE' | 'OCCUPIED' | 'MAINTENANCE';

/** Trạng thái hiển thị trên lưới — thêm OVERDUE (dẫn xuất từ OCCUPIED + cờ overdue). */
export type YardSlotDisplayStatus = YardSlotStatus | 'OVERDUE';

export const YARD_SLOT_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  FREE: 'ui.yard.slotFREE',
  OCCUPIED: 'ui.yard.slotOCCUPIED',
  OVERDUE: 'ui.yard.slotOVERDUE',
  MAINTENANCE: 'ui.yard.slotMAINTENANCE',
};

/** Dùng lại bảng màu trạng thái của SRS 8.1, không sinh bộ màu mới. */
export const YARD_SLOT_STATUS_TONES: Record<string, string> = {
  FREE: 'idle',
  OCCUPIED: 'processing',
  OVERDUE: 'danger',
  MAINTENANCE: 'waiting',
};

export function yardSlotStatusLabel(status: string, t?: Translate): string {
  return translateCode(YARD_SLOT_STATUS_LABEL_KEYS[status], status, t);
}

export function yardSlotStatusTone(status: string): string {
  return YARD_SLOT_STATUS_TONES[status] || 'idle';
}

// --- Vòng đời kiểm tra / tập kết của xe trong bãi (F44) ----------------------

export type InspectionStatus = 'WAITING_INSPECTION' | 'INSPECTING' | 'INSPECTION_DONE' | 'CONSOLIDATING';

/** Nhãn trạng thái kiểm tra tra theo **mã** — không so khớp chuỗi tiếng Việt. */
export const INSPECTION_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  WAITING_INSPECTION: 'ui.yard.inspWAITING_INSPECTION',
  INSPECTING: 'ui.yard.inspINSPECTING',
  INSPECTION_DONE: 'ui.yard.inspINSPECTION_DONE',
  CONSOLIDATING: 'ui.yard.inspCONSOLIDATING',
};

/** Màu trạng thái theo SRS 8.1 (vàng chờ · xanh dương đang làm · xanh lá xong · xám tập kết). */
export const INSPECTION_STATUS_TONES: Record<string, string> = {
  WAITING_INSPECTION: 'waiting',
  INSPECTING: 'processing',
  INSPECTION_DONE: 'done',
  CONSOLIDATING: 'idle',
};

/** Thứ tự vòng đời: chờ kiểm tra → đang kiểm tra → xong → sang tải/tập kết. */
export const INSPECTION_STATUS_ORDER: InspectionStatus[] = [
  'WAITING_INSPECTION',
  'INSPECTING',
  'INSPECTION_DONE',
  'CONSOLIDATING',
];

export function inspectionStatusLabel(status: string | undefined, t?: Translate): string {
  const code = status || 'WAITING_INSPECTION';
  return translateCode(INSPECTION_STATUS_LABEL_KEYS[code], code, t);
}

export function inspectionStatusTone(status: string | undefined): string {
  return INSPECTION_STATUS_TONES[status || 'WAITING_INSPECTION'] || 'idle';
}

/**
 * Trạng thái kiểm tra kế tiếp hợp lệ; trả `null` khi đã ở bước cuối hoặc mã lạ.
 * Chuyển sai bước là việc của API chặn (409) — hàm này chỉ gợi ý bước kế cho nút bấm.
 */
export function nextInspectionStatus(status: string | undefined): InspectionStatus | null {
  const index = INSPECTION_STATUS_ORDER.indexOf((status || 'WAITING_INSPECTION') as InspectionStatus);
  if (index < 0 || index >= INSPECTION_STATUS_ORDER.length - 1) return null;
  return INSPECTION_STATUS_ORDER[index + 1];
}

/** Xe đang chiếm ô đỗ — `since` là mốc bắt đầu lưu bãi. */
export interface YardSlotAssignment {
  /** Mã bản ghi điều phối — dùng cho `PATCH /dispatch/assignments/:id` khi chuyển ô. */
  id: string;
  dossierId: string;
  code: string;
  plateNumber: string;
  /** Tên doanh nghiệp/cá nhân khai hồ sơ (BE join `enterprises`). */
  entity?: string;
  since: string;
  /** Dự kiến rời bãi = giờ vào bãi + giờ lưu tối đa; null khi thiếu mốc vào bãi. */
  expectedDeparture?: string | null;
  /** Trạng thái kiểm tra/tập kết hiện tại (F44). */
  inspectionStatus?: InspectionStatus;
  /** Mốc cập nhật trạng thái kiểm tra gần nhất. */
  inspectionUpdatedAt?: string;
}

export interface YardSlot {
  code: string;
  status: YardSlotStatus;
  /** Ô đang có xe và đã quá hạn lưu bãi (BE tính). Chỉ đúng khi `status = 'OCCUPIED'`. */
  overdue?: boolean;
  assignment: YardSlotAssignment | null;
  /** Khu chứa ô — web gán khi gộp "Tất cả khu vực" để thao tác biết ô thuộc bãi nào. */
  yardId?: string;
  /** Mã khu chứa ô — hiển thị trong chế độ gộp tất cả khu vực. */
  yardCode?: string;
}

/** `GET /yards`. */
export interface YardSummary {
  id: string;
  code: string;
  name: string;
  capacity: number;
  occupied: number;
  /** Số ô quá hạn lưu bãi trong khu (BE tính) — KPI và viền cảnh báo khu. */
  overdue?: number;
}

/** `GET /yards/:id`. */
export interface YardDetail extends YardSummary {
  slots: YardSlot[];
}

// --- Cấu hình bãi và sức chứa (F42 — UI-11) ---------------------------------

/**
 * `GET /catalog/yard-zones` — một khu bãi trong danh mục `YARD_ZONE`.
 * `capacity`/`slotCount`/`active` lấy từ danh mục (nguồn sự thật); `used` là số ô đang có xe.
 */
export interface YardZone {
  code: string;
  name: string;
  capacity: number;
  slotCount: number;
  active: boolean;
  used: number;
}

/** `PATCH /catalog/yard-zones/:code` — chỉ gửi phần cấu hình cần đổi (F42). */
export interface YardZoneUpdatePayload {
  name?: string;
  capacity?: number;
}

/** Tỷ lệ lấp đầy (%) — làm tròn, chặn chia 0 khi bãi chưa khai sức chứa. */
export function yardOccupancyPercent(yard: { capacity?: number; occupied?: number } | null | undefined): number {
  const capacity = Math.max(0, Number(yard?.capacity) || 0);
  const occupied = Math.max(0, Number(yard?.occupied) || 0);
  if (!capacity) return 0;
  return Math.min(100, Math.round((occupied / capacity) * 100));
}

export function freeSlots(yard: YardDetail | null | undefined): YardSlot[] {
  return (yard?.slots || []).filter((slot) => slot.status === 'FREE');
}

/**
 * Trạng thái hiển thị của ô trên lưới (F42): OCCUPIED + cờ `overdue` → OVERDUE để tô đỏ.
 * Mã ASCII trong tập đóng, không dò chuỗi tiếng Việt.
 */
export function slotDisplayStatus(slot: YardSlot): YardSlotDisplayStatus {
  if (slot.status === 'OCCUPIED' && slot.overdue) return 'OVERDUE';
  return slot.status;
}
