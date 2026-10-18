// =============================================================================
// Mô hình kiểm soát cổng (P4 — UI-09). Khớp contract API `/gate/*`.
//
// Ba ràng buộc bắt buộc của màn hình này:
//   1. **Không điều khiển barie** (F40 = Giai đoạn 2) — chỉ *ghi nhận sự kiện cổng*
//      thủ công (F38) kèm checklist điều kiện (F39).
//   2. **Quét QR bằng camera là đường phụ, ô nhập mã là đường chính** (F34, điểm C2 đã
//      chốt dùng camera trình duyệt). Máy trạm không có camera / chạy HTTP / bị từ chối
//      quyền vẫn phải tra cứu được bằng ô nhập mã — đầu đọc QR phần cứng giả lập bàn
//      phím cũng gõ thẳng vào ô đó.
//   3. `evaluation.canOpen = false` ⇒ **không cho xác nhận cho qua** và phải liệt kê
//      rõ điều kiện còn thiếu (DoD của P4). API vẫn chặn lại bằng 409 nếu bị ép gửi.
// =============================================================================

import { MessageKey } from '../i18n/message-catalog';
import { DossierSummary } from './declaration.model';
import { GateDirection } from './dispatch.model';
import { Translate, translateCode } from './label.util';

export type GateStatusColor = 'GREEN' | 'YELLOW' | 'RED';

export const GATE_STATUS_COLOR_LABEL_KEYS: Record<string, MessageKey> = {
  GREEN: 'ui.gate.colorGREEN',
  YELLOW: 'ui.gate.colorYELLOW',
  RED: 'ui.gate.colorRED',
};

/** Ánh xạ sang bảng màu trạng thái SRS 8.1 dùng chung cho mọi chip. */
export const GATE_STATUS_COLOR_TONES: Record<string, string> = {
  GREEN: 'done',
  YELLOW: 'waiting',
  RED: 'rejected',
};

export function gateStatusColorLabel(color: string, t?: Translate): string {
  return translateCode(GATE_STATUS_COLOR_LABEL_KEYS[color], color, t);
}

export function gateStatusColorTone(color: string): string {
  return GATE_STATUS_COLOR_TONES[color] || 'idle';
}

export interface GateInfo {
  code: string;
  name: string;
  direction: string;
}

export interface GateEvaluationResult {
  canOpen: boolean;
  statusColor: GateStatusColor;
  /** Lý do chưa được qua cổng — hiển thị nguyên văn, không rút gọn. */
  blockingReasons: string[];
  /** Bước nghiệp vụ bắt buộc phải hoàn thành trước khi qua cổng. */
  requiredCompletedSteps: string[];
}

export interface GateChecklistItem {
  code: string;
  label: string;
  required: boolean;
  checked: boolean;
  note?: string;
}

/** `GET /gate/lookup?code=<mã hồ sơ>`. */
export interface GateLookupResult {
  dossier: DossierSummary;
  gate: GateInfo;
  evaluation: GateEvaluationResult;
  checklist: GateChecklistItem[];
}

export type GateDecision = 'ALLOW' | 'DENY';

export const GATE_DECISION_LABEL_KEYS: Record<string, MessageKey> = {
  ALLOW: 'ui.gate.decisionALLOW',
  DENY: 'ui.gate.decisionDENY',
};

export function gateDecisionLabel(decision: string, t?: Translate): string {
  return translateCode(GATE_DECISION_LABEL_KEYS[decision], decision, t);
}

export interface GateChecklistInput {
  code: string;
  checked: boolean;
  note?: string;
}

/** `POST /gate/events`. */
export interface GateEventPayload {
  dossierId: string;
  gateCode?: string;
  direction?: GateDirection;
  decision: GateDecision;
  checklist?: GateChecklistInput[];
  note?: string;
  /**
   * CR2 — bật cờ dịch tễ khi CHO QUA ở cổng VÀO ("Ưu tiên kiểm dịch"). Một chiều: đặt rồi không gỡ.
   * Chỉ gửi `true` với chiều vào + quyết định ALLOW; các trường hợp khác bỏ trống.
   */
  prioritizeQuarantine?: boolean;
}

/**
 * Một dòng nhật ký sự kiện cổng (`GET /gate/events`).
 *
 * Contract chỉ quy định bộ lọc và khung phân trang, chưa chốt đủ tên trường của
 * từng dòng — nên mọi trường ngoài `id`/`decision` đều để tùy chọn và giao diện
 * luôn có giá trị dự phòng.
 */
export interface GateEvent {
  id: string;
  /**
   * Mốc ghi nhận sự kiện. API trả trường **`occurredAt`**; `at` chỉ giữ cho tương thích ngược
   * (một số fixture/cũ còn dùng) — giao diện luôn đọc `occurredAt` trước.
   */
  occurredAt?: string;
  at?: string;
  dossierId?: string;
  dossierCode?: string;
  plateNumber?: string;
  gateCode?: string;
  gateName?: string;
  /** Hướng cổng thực tế của sự kiện (`ENTRY` = xe vào · `EXIT` = xe ra) — bảng `gate_events` luôn ghi trường này. */
  direction?: string;
  decision: GateDecision;
  note?: string;
  actorName?: string;
}

/** `GET /gate/summary` — KPI lượt qua cổng trong ngày (tùy chọn theo cổng). */
export interface GateSummary {
  gateCode: string | null;
  allowed: number;
  denied: number;
  total: number;
}

/**
 * Chiều qua cổng suy từ loại hồ sơ — chỉ để hiển thị pill "đúng/sai chiều" tại cổng (mẫu MH09).
 * Bám đúng quy ước `isExportLike` của API: hàng xuất và sang tải rời cửa khẩu (`EXIT`); hàng nhập
 * và xe tự hành đi vào (`ENTRY`). Đây là **gợi ý hiển thị**, không phải điều kiện chặn — điều kiện
 * qua cổng do máy chủ quyết qua `evaluation`.
 */
export function expectedGateDirection(dossierType: string): 'ENTRY' | 'EXIT' {
  return dossierType === 'EXPORT' || dossierType === 'TRANSSHIPMENT_EXPORT' ? 'EXIT' : 'ENTRY';
}

export interface GateEventFilters {
  dossierId?: string;
  dossierCode?: string;
  plateNumber?: string;
  gateCode?: string;
  direction?: string;
  decision?: string;
  actorName?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Danh sách điều kiện **còn thiếu** để hiển thị khi `canOpen = false`.
 *
 * BUG-019 — CHỈ lấy `blockingReasons`: đây đã là các mục **chưa đạt** do máy chủ trả (nghiệp vụ,
 * phí, và checklist bắt buộc chưa tích). Trước đây còn nối thêm `requiredCompletedSteps` — vốn là
 * **toàn bộ** điều kiện bắt buộc (kể cả bước ĐÃ hoàn thành) — nên hồ sơ đã xong liên ngành vẫn bị
 * liệt kê các bước đó như "chưa hoàn thành". Không nối nữa để không hiển thị điều kiện đã đạt.
 */
export function missingConditions(evaluation: GateEvaluationResult | null | undefined): string[] {
  if (!evaluation) return [];
  return (evaluation.blockingReasons || []).filter((item) => !!item);
}

/*
 * Đọc nội dung chuỗi QR quét được: xem `gate-qr.model.ts` (`readDossierQr`) — chuỗi do API
 * sinh có dạng `SG1|<mã hồ sơ>|<giây epoch>` nên việc tách mã nằm ở đúng một chỗ, không
 * chép lại ở màn hình.
 */

/** Mục checklist bắt buộc nhưng chưa tích — chặn ngay tại web trước khi gọi API. */
export function uncheckedRequiredItems(
  checklist: readonly GateChecklistItem[] | null | undefined,
  draft: Record<string, boolean> = {},
): GateChecklistItem[] {
  return (checklist || []).filter((item) => item.required && !(draft[item.code] ?? item.checked));
}

/**
 * Điều kiện **nghiệp vụ + tài chính** (KHÔNG gồm checklist tại cổng) đã đạt hay chưa, tính TẠI CHỖ
 * từ kết quả `GET /gate/lookup`.
 *
 * `blockingReasons` do máy chủ trả GỘP điều kiện nghiệp vụ/phí và các mục checklist bắt buộc chưa
 * tích, trong đó phần checklist luôn xếp CUỐI (`[...nghiệp vụ, ...checklist]`). Lúc tra cứu FE chưa
 * gửi checklist nào nên MỌI mục required đang chưa tích (theo trạng thái máy chủ) đều có mặt trong
 * `blockingReasons`; trừ đúng số mục đó khỏi tổng sẽ còn lại phần điều kiện nghiệp vụ/phí — thứ
 * KHÔNG đổi theo thao tác tích của người dùng. `≤ 0` nghĩa là chỉ còn chờ tích đủ checklist.
 *
 * Đây là chỗ sửa BUG-002: nút "Cho qua" trước đây bám cứng `evaluation.canOpen` của lookup (luôn
 * `false` vì lookup không nhận checklist), nay tách rõ hai nguồn điều kiện. BE vẫn là nguồn sự thật:
 * bấm ghi mà chưa đạt thì trả 409.
 */
export function gateWorkflowConditionsMet(result: GateLookupResult | null | undefined): boolean {
  if (!result?.evaluation) return false;
  return result.evaluation.canOpen || (result.evaluation.blockingReasons || []).filter((item) => !!item).length === 0;
}
