// =============================================================================
// Mô hình điều phối phương tiện (P4 — UI-08) + số thứ tự hàng đợi (F27).
// Khớp contract API `/dispatch/*`, `/queue-tickets`, `/catalog/gates`, `/catalog/lanes`.
//
// Ba nguyên tắc bắt buộc của màn hình này (điểm D1 của kế hoạch MVP):
//   1. **Bảng điều phối dạng cột** đúng như SRS UI-08 — cột do API trả trong
//      `board.columns`, web không tự chia nhóm.
//   2. **Không có sơ đồ khu vực dạng flow, không có dòng thời gian ETA, không có
//      cảnh báo ùn tắc** dù mockup MH08 có vẽ (F57 thuộc Giai đoạn 2).
//   3. Thời gian chờ chỉ là khoảng thời gian ĐÃ chờ (`waitingSeconds`) — không suy
//      ra hạn chót hay đếm ngược, giống quy ước của UI-06.
// =============================================================================

import { MessageKey } from '../i18n/message-catalog';
import { Translate, translateCode, translateLabel } from './label.util';

// --- Danh mục cổng và làn (F04) ---------------------------------------------

export type GateDirection = 'ENTRY' | 'EXIT';

export const GATE_DIRECTION_LABEL_KEYS: Record<string, MessageKey> = {
  ENTRY: 'ui.gate.directionENTRY',
  EXIT: 'ui.gate.directionEXIT',
};

export function gateDirectionLabel(direction: string, t?: Translate): string {
  return translateCode(GATE_DIRECTION_LABEL_KEYS[direction], direction, t);
}

/**
 * Chiều cổng hợp lệ theo luồng của hồ sơ (cùng quy ước `flowForDossierType` bên API):
 * hồ sơ **nhập** (`IMPORT`/`SELF_PROPELLED`) chỉ đi cổng chiều `ENTRY`; hồ sơ **xuất**
 * (`EXPORT`/`TRANSSHIPMENT`) chỉ đi cổng chiều `EXIT`. Dùng để lọc lựa chọn cổng khi gán vị trí.
 * Mã ASCII trong tập đóng — không dò chuỗi hiển thị.
 */
export function gateDirectionForDossierType(type: string): GateDirection {
  return type === 'EXPORT' || type === 'TRANSSHIPMENT_EXPORT' ? 'EXIT' : 'ENTRY';
}

/** `GET /catalog/gates`. */
export interface GateCatalogItem {
  code: string;
  name: string;
  direction: GateDirection;
  checkpoint: string;
  active: boolean;
}

/** `GET /catalog/lanes`. */
export interface LaneCatalogItem {
  code: string;
  name: string;
  gateCode: string;
  active: boolean;
}

// --- Số thứ tự hàng đợi (F27) ------------------------------------------------

/**
 * `POST /queue-tickets` trả về **một số thứ tự thuần** gắn với hồ sơ, duy nhất theo (ngày, luồng).
 * Số không mang vòng đời/trạng thái gọi — chỉ để hiển thị chip số trên thẻ ở màn Điều phối.
 */
export interface QueueTicket {
  id: string;
  ticketNumber: string | number;
  ticketCode?: string;
  issuedDate: string;
  flow: string;
  checkpoint: string;
  issuedAt: string;
}

// --- Bảng điều phối ----------------------------------------------------------

/**
 * Vị trí đã gán cho một phương tiện. **Một xe chỉ ở một vị trí** (F29, F31) — API
 * trả 409 khi vị trí đã có xe khác, web phải hiện nguyên thông báo đó.
 */
export interface DispatchAssignment {
  id: string;
  gateCode: string | null;
  laneCode: string | null;
  yardId: string | null;
  slotCode: string | null;
}

/** Thẻ phương tiện trên bảng điều phối. */
export interface DispatchCard {
  dossierId: string;
  code: string;
  plateNumber: string;
  enterpriseName: string;
  ticketNumber: string | number | null;
  ticketCode?: string | null;
  /** Loại hồ sơ (`IMPORT`/`EXPORT`/`SELF_PROPELLED`/`TRANSSHIPMENT`) — dùng để lọc cổng theo luồng khi gán. */
  type: string;
  status: string;
  /** Thời gian ĐÃ chờ, tính bằng giây. Không phải thời gian còn lại. */
  waitingSeconds: number;
  assignment: DispatchAssignment | null;
}

export interface DispatchColumn {
  key: string;
  label: string;
  items: DispatchCard[];
}

/**
 * KPI tải của cửa khẩu — **3 con số** theo 3 khung điều phối (CR41): chờ điều phối, đang kiểm tra,
 * đã kiểm tra xong.
 */
export interface DispatchKpi {
  waiting: number;
  inspecting: number;
  inspected: number;
}

/** `GET /dispatch/board`. */
export interface DispatchBoard {
  kpi: DispatchKpi;
  columns: DispatchColumn[];
}

export interface DispatchBoardFilters {
  checkpoint?: string;
  date?: string;
  from?: string;
  to?: string;
  search?: string;
}

/** `POST /dispatch/assignments`. */
export interface DispatchAssignmentPayload {
  dossierId: string;
  gateCode?: string;
  laneCode?: string;
  yardId?: string;
  slotCode?: string;
}

/** `PATCH /dispatch/assignments/:id` — chỉ gửi phần vị trí thay đổi. */
export type DispatchAssignmentPatch = Omit<DispatchAssignmentPayload, 'dossierId'>;

// --- Lịch sử điều phối (F33 — GET /dispatch/history) -------------------------

/** Mã hành động ghi vết điều phối — khớp `DispatchAuditAction` bên API. */
export type DispatchHistoryAction = 'DISPATCH_ASSIGN' | 'DISPATCH_MOVE' | 'DISPATCH_RELEASE';

export const DISPATCH_HISTORY_ACTION_LABEL_KEYS: Record<DispatchHistoryAction, MessageKey> = {
  DISPATCH_ASSIGN: 'ui.dispatchHistory.actionAssign',
  DISPATCH_MOVE: 'ui.dispatchHistory.actionMove',
  DISPATCH_RELEASE: 'ui.dispatchHistory.actionRelease',
};

export function dispatchHistoryActionLabel(action: string, t?: Translate): string {
  return translateCode(DISPATCH_HISTORY_ACTION_LABEL_KEYS[action as DispatchHistoryAction], action, t);
}

/** Ảnh chụp vị trí "từ → đến" lưu trong nhật ký. */
export interface DispatchPlacementSnapshot {
  gate: string | null;
  lane: string | null;
  yard: string | null;
  slot: string | null;
}

/** Một dòng lịch sử điều phối. */
export interface DispatchHistoryEntry {
  id: string;
  at: string;
  action: DispatchHistoryAction;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  dossierId: string | null;
  dossierCode: string | null;
  plateNumber?: string | null;
  /** Số thứ tự điều phối gần nhất của hồ sơ (BUG-084); `null` nếu chưa được cấp số. */
  ticketNumber: number | null;
  /** Mã số thứ tự đầy đủ gồm ngày và 4 chữ số (VD: '14/08/2026.0001'); `null` nếu chưa cấp số. */
  ticketCode?: string | null;
  from: DispatchPlacementSnapshot | null;
  to: DispatchPlacementSnapshot | null;
}

export interface DispatchHistoryFilters {
  /** Lọc theo mã hồ sơ người dùng nhập; API tự dịch sang id. */
  dossierCode?: string;
  actor?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

function formatYardName(name: string, t?: Translate): string {
  if (/^(?:Bãi|Kho|Khu|Yard)/i.test(name)) {
    return name;
  }
  return translateLabel('ui.dispatch.atYard', t, { name });
}

/** Mô tả ngắn một vị trí trong lịch sử; rỗng nghĩa là không có vị trí (chưa gán / đã bỏ). */
export function placementLabel(snapshot: DispatchPlacementSnapshot | null, t?: Translate): string {
  if (!snapshot) return translateLabel('ui.dispatchHistory.noPlace', t);
  const parts = [
    snapshot.gate ? translateLabel('ui.dispatch.atGate', t, { code: snapshot.gate }) : '',
    snapshot.lane ? translateLabel('ui.dispatch.atLane', t, { code: snapshot.lane }) : '',
    snapshot.yard ? formatYardName(snapshot.yard, t) : '',
    snapshot.slot ? translateLabel('ui.dispatch.atSlot', t, { code: snapshot.slot }) : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : translateLabel('ui.dispatchHistory.noPlace', t);
}

/** Mô tả vị trí đã gán, dùng cho thẻ phương tiện và hộp thoại xác nhận. */
export function assignmentSummary(
  assignment: DispatchAssignment | null | undefined,
  yardName = '',
  t?: Translate,
): string {
  if (!assignment) return translateLabel('ui.dispatch.noPosition', t);
  const rawYard = yardName || assignment.yardId;
  const parts = [
    assignment.gateCode ? translateLabel('ui.dispatch.atGate', t, { code: assignment.gateCode }) : '',
    assignment.laneCode ? translateLabel('ui.dispatch.atLane', t, { code: assignment.laneCode }) : '',
    rawYard ? formatYardName(rawYard, t) : '',
    assignment.slotCode ? translateLabel('ui.dispatch.atSlot', t, { code: assignment.slotCode }) : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : translateLabel('ui.dispatch.noPosition', t);
}

export interface CallNextDispatchPayload {
  checkpoint?: string;
  date?: string;
  from?: string;
  to?: string;
  dossierId?: string;
}

export interface CallNextDispatchResult {
  called: boolean;
  dossierId?: string;
  dossierCode?: string;
  plateNumber?: string;
  ticketNumber?: number | null;
  ticketCode?: string | null;
  enterpriseName?: string;
  message?: string;
}

