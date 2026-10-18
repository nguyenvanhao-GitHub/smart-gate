// =============================================================================
// Mô hình xử lý liên ngành (P3 — UI-06 hàng đợi, UI-07 xử lý nghiệp vụ).
// Khớp contract API `/workflow/*` + `/catalog/reason-codes`.
//
// Hai nguyên tắc bắt buộc của giai đoạn này:
//   1. **Không có SLA.** SRS UI-06 chỉ yêu cầu tab, bộ lọc/ưu tiên và bảng; F26 chỉ
//      yêu cầu *ghi nhận* thời gian. Vì vậy chỉ có `elapsedSecondsInStep` —
//      tuyệt đối không suy ra hạn chót hay đồng hồ đếm ngược (điểm D1 của kế hoạch).
//   2. **Quyết định do API quyết.** Danh sách hành động lấy từ `availableDecisions`,
//      web không tự suy luận từ vai trò.
//
// Mọi hàm nhãn nhận `string` và có giá trị dự phòng vì bước/cơ quan/mã lý do đều là
// danh mục cấu hình được ở BE (SRS 7.2).
// =============================================================================

import { MessageKey } from '../i18n/message-catalog';
import { DossierDetail, dossierStatusLabel } from './declaration.model';
import { Translate, translateCode, translateLabel } from './label.util';

// --- Hàng đợi (UI-06) --------------------------------------------------------

/** Tab hàng đợi theo SRS UI-06. */
export type WorkflowQueueTab = 'todo' | 'done' | 'waiting';

export const WORKFLOW_QUEUE_TABS: Array<{ key: WorkflowQueueTab; labelKey: MessageKey }> = [
  { key: 'todo', labelKey: 'ui.workflow.tabTodo' },
  { key: 'done', labelKey: 'ui.workflow.tabDone' },
  { key: 'waiting', labelKey: 'ui.workflow.tabWaiting' },
];

export function isWorkflowQueueTab(value: string): value is WorkflowQueueTab {
  return WORKFLOW_QUEUE_TABS.some((tab) => tab.key === value);
}

/** Chiều bước cổng (CR7/CR26): xe VÀO / xe RA cửa khẩu. */
export type GateDirection = 'ENTRY' | 'EXIT';

export interface QueueCurrentStep {
  code: string;
  name: string;
  agencyCode: string;
  agencyName: string;
  /**
   * Bước cổng (CR7/CR26): `ENTRY`/`EXIT` với bước "Biên phòng xác nhận xe vào/ra", `null` với bước
   * thường. Hàng đợi hiển thị "xử lý tại Cổng vào/ra" cho bước cổng và không mở panel quyết định.
   */
  gate: GateDirection | null;
}

/** Một dòng hàng đợi — `GET /workflow/queue`. */
export interface QueueItem {
  dossierId: string;
  code: string;
  type: string;
  status: string;
  epidemicFlag?: boolean;
  enterprise: { taxCode: string; name: string };
  vehicle: { plateNumber: string };
  /**
   * `null` khi hồ sơ đã đi hết quy trình — không còn bước nào đang chờ.
   * Gặp ở tab "Đã xử lý", nên mọi chỗ đọc trường này phải chịu được null.
   */
  currentStep: QueueCurrentStep | null;
  /** Tất cả các bước đang mở / chờ xử lý */
  activeSteps?: QueueCurrentStep[];
  createdAt: string;
  updatedAt: string;
}

/**
 * CR26 — cột "Trạng thái" của hàng đợi hiển thị **status kèm bước**, dạng "<Lực lượng> - <trạng thái>".
 * Bốn trạng thái suy từ trạng thái hồ sơ: đang xử lý / xác nhận hoàn thành / yêu cầu sửa đổi, bổ sung
 * / từ chối. Mã ASCII trong tập đóng → tra khóa i18n, không dò chuỗi hiển thị.
 */
export function queueStateLabel(status: string, t?: Translate): string {
  const normalized = status === 'PROCESSING' || status === 'IN_PROGRESS' ? 'BUSINESS_PROCESSING' : status;
  return dossierStatusLabel(normalized, t);
}

export interface WorkflowQueueFilters {
  tab?: WorkflowQueueTab;
  keyword?: string;
  type?: string;
  status?: string;
  checkpoint?: string;
  /** Khoảng ngày hồ sơ vào hàng đợi (F20) — chuỗi `yyyy-MM-dd`. */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

// --- Quy trình và bước (UI-07) ----------------------------------------------

/** Cơ quan chuyên ngành — khóa dịch i18n theo mã cơ quan. */
export const AGENCY_LABEL_KEYS: Record<string, MessageKey> = {
  BP: 'ui.role.BORDER_GUARD',
  HQ: 'ui.role.CUSTOMS',
  KD: 'ui.role.QUARANTINE',
  BORDER_GUARD: 'ui.role.BORDER_GUARD',
  CUSTOMS: 'ui.role.CUSTOMS',
  QUARANTINE: 'ui.role.QUARANTINE',
};

export const AGENCY_ICONS: Record<string, string> = {
  BP: 'shield',
  HQ: 'account_balance',
  KD: 'health_and_safety',
  BORDER_GUARD: 'shield',
  CUSTOMS: 'account_balance',
  QUARANTINE: 'health_and_safety',
};

/**
 * Tên cơ quan, dịch theo ngôn ngữ hiện tại nếu có khóa tương ứng.
 */
export function agencyLabel(code: string, fallback = '', t?: Translate): string {
  if (t && AGENCY_LABEL_KEYS[code]) {
    return translateCode(AGENCY_LABEL_KEYS[code], fallback || code, t);
  }
  return fallback || code || translateLabel('ui.workflow.agencyUnknown', t);
}

export function agencyIcon(code: string): string {
  return AGENCY_ICONS[code] || 'verified';
}

// Đúng 5 mã của `WorkflowStepStatus` (BE — workflow.enums.ts): PENDING · IN_PROGRESS ·
// WAITING_SUPPLEMENT · COMPLETED · REJECTED. Không khai mã chết (WAITING/PROCESSING/
// NEED_SUPPLEMENT/APPROVED/SKIPPED) — mã lạ rơi về chính nó qua `translateCode`.
export const WORKFLOW_STEP_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  PENDING: 'ui.workflow.stepPENDING',
  IN_PROGRESS: 'ui.workflow.stepIN_PROGRESS',
  WAITING_SUPPLEMENT: 'ui.workflow.stepWAITING_SUPPLEMENT',
  COMPLETED: 'ui.workflow.stepCOMPLETED',
  REJECTED: 'ui.workflow.stepREJECTED',
};

export const WORKFLOW_STEP_STATUS_TONES: Record<string, string> = {
  PENDING: 'idle',
  IN_PROGRESS: 'processing',
  WAITING_SUPPLEMENT: 'waiting',
  COMPLETED: 'done',
  REJECTED: 'rejected',
};

export function workflowStepStatusLabel(status: string, t?: Translate): string {
  return translateCode(WORKFLOW_STEP_STATUS_LABEL_KEYS[status], status, t);
}

export function workflowStepStatusTone(status: string): string {
  return WORKFLOW_STEP_STATUS_TONES[status] || 'idle';
}

export interface WorkflowStep {
  code: string;
  name: string;
  agencyCode: string;
  agencyName: string;
  order: number;
  status: string;
  /**
   * Bước cổng (CR7/CR26): `ENTRY`/`EXIT` với bước "Biên phòng xác nhận xe vào/ra", `null` với bước
   * thường. Dùng để phân biệt bước cổng Biên phòng với bước kiểm tra nghiệp vụ Biên phòng khi vẽ cụm.
   */
  gate?: GateDirection | null;
  enteredAt?: string | null;
  completedAt?: string | null;
  elapsedSeconds?: number;
  actorId?: string | null;
  actorName?: string | null;
  decision?: string | null;
  reasonCode?: string | null;
  reasonNote?: string | null;
}

/**
 * CR44 — giai đoạn của tập bước đang mở. Bám mã ASCII của BE (`WorkflowStage`); cụm nghiệp vụ song
 * song ứng với `INSPECTION`. `null` khi phiên đã đóng.
 */
export type WorkflowStage = 'ENTRY_GATE' | 'INSPECTION' | 'FEE' | 'EXIT_GATE';

export interface WorkflowInstance {
  id: string;
  /**
   * **Bước đại diện** của tập bước đang mở (bước mở đầu tiên). Giữ hợp đồng P3 nhưng KHÔNG dùng để
   * biết cụm song song — dùng `activeStepCodes` cho việc đó (CR44).
   */
  currentStepCode: string;
  /** CR44 — tập mã bước ĐANG MỞ, đã sắp thứ tự. Trong cụm nghiệp vụ là 2–3 mã song song; ngoài cụm đúng 1 mã. */
  activeStepCodes: string[];
  /** CR44 — giai đoạn hiện hành của tập bước mở; `null` khi phiên đã đóng. */
  activeStage: WorkflowStage | null;
  status: string;
  totalElapsedSeconds: number;
  steps: WorkflowStep[];
}

export interface WorkflowChecklistItem {
  code: string;
  label: string;
  agencyCode: string;
  required: boolean;
  checked: boolean;
  note?: string;
}

/** Kết quả `GET /workflow/dossiers/:id`. */
export interface WorkflowDossierView {
  dossier: DossierDetail;
  instance: WorkflowInstance;
  checklist: WorkflowChecklistItem[];
  availableDecisions: WorkflowDecision[];
}

// --- Quyết định xử lý --------------------------------------------------------

/** CR36 — còn đúng 3 lựa chọn. `FORWARD` (chuyển tiếp) và `REVOKE` (thu hồi) đã bị bỏ hẳn. */
export type WorkflowDecision = 'APPROVE' | 'REQUEST_SUPPLEMENT' | 'REJECT';

export const DECISION_LABEL_KEYS: Record<string, MessageKey> = {
  APPROVE: 'ui.workflow.decisionAPPROVE',
  COMPLETED: 'ui.workflow.decisionAPPROVE',
  REQUEST_SUPPLEMENT: 'ui.workflow.decisionREQUEST_SUPPLEMENT',
  WAITING_SUPPLEMENT: 'ui.workflow.decisionREQUEST_SUPPLEMENT',
  REJECT: 'ui.workflow.decisionREJECT',
  REJECTED: 'ui.workflow.decisionREJECT',
  SUBMITTED: 'ui.workflow.decisionSUBMITTED',
  ALLOW: 'ui.gate.decisionALLOW',
  DENY: 'ui.gate.decisionDENY',
};

export const DECISION_HINT_KEYS: Record<string, MessageKey> = {
  APPROVE: 'ui.workflow.hintAPPROVE',
  REQUEST_SUPPLEMENT: 'ui.workflow.hintREQUEST_SUPPLEMENT',
  REJECT: 'ui.workflow.hintREJECT',
};

export function decisionHint(decision: string, t?: Translate): string {
  const key = DECISION_HINT_KEYS[decision];
  return key ? translateLabel(key, t) : '';
}

export const DECISION_TONES: Record<string, string> = {
  APPROVE: 'done',
  COMPLETED: 'done',
  REQUEST_SUPPLEMENT: 'warning',
  WAITING_SUPPLEMENT: 'warning',
  REJECT: 'rejected',
  REJECTED: 'rejected',
  SUBMITTED: 'done',
  ALLOW: 'done',
  DENY: 'rejected',
};

export function decisionLabel(decision: string, t?: Translate): string {
  return translateCode(DECISION_LABEL_KEYS[decision], decision, t);
}

export function decisionTone(decision: string): string {
  return DECISION_TONES[decision] || 'idle';
}

/** Danh mục mã lý do dùng chung (F23–F24, F47). */
export type ReasonCodeScope = 'SUPPLEMENT' | 'REJECT' | 'FEE_ADJUST';

export interface ReasonCode {
  code: string;
  name: string;
  scope: string;
  active: boolean;
}

/**
 * Nhóm danh mục mã lý do gắn với từng quyết định (CR37). Mã lý do nay **tùy chọn** — bảng này chỉ
 * để web nạp đúng danh mục cho ô chọn khi hiển thị, không còn nghĩa "bắt buộc".
 */
export const DECISION_REASON_SCOPES: Record<string, ReasonCodeScope> = {
  REQUEST_SUPPLEMENT: 'SUPPLEMENT',
  REJECT: 'REJECT',
};

export function reasonScopeOf(decision: string): ReasonCodeScope | null {
  return DECISION_REASON_SCOPES[decision] || null;
}

/** CR37 — có hiện ô chọn mã lý do (tùy chọn) hay không: đúng với yêu cầu bổ sung / từ chối. */
export function decisionShowsReasonCode(decision: string): boolean {
  return !!reasonScopeOf(decision);
}

/**
 * CR37 — **ghi chú (nội dung lý do) bắt buộc** khi yêu cầu sửa đổi, bổ sung hoặc từ chối. API trả 400
 * nếu để trống, nên web chặn trước để không bắt người dùng bấm rồi mới báo lỗi.
 */
export function decisionRequiresReasonNote(decision: string): boolean {
  return decision === 'REQUEST_SUPPLEMENT' || decision === 'REJECT';
}

export interface WorkflowChecklistInput {
  code: string;
  checked: boolean;
  note?: string;
}

export interface WorkflowDecisionPayload {
  stepCode: string;
  decision: WorkflowDecision;
  reasonCode?: string;
  reasonNote?: string;
  checklist?: WorkflowChecklistInput[];
}

// --- Tiện ích hiển thị -------------------------------------------------------

/**
 * Thời gian đã trôi qua dạng đọc được — thay cho đồng hồ đếm ngược SLA (D1).
 * Luôn là khoảng thời gian ĐÃ dùng, không bao giờ là thời gian còn lại.
 */
export function formatElapsed(seconds: number | null | undefined, t?: Translate): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (total < 60) return translateLabel('ui.duration.seconds', t, { value: total });
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return translateLabel('ui.duration.minutes', t, { value: minutes });
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return translateLabel('ui.duration.hoursMinutes', t, { hours, minutes: remMinutes });
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (remMinutes > 0) {
    return translateLabel('ui.duration.daysHoursMinutes', t, { days, hours: remHours, minutes: remMinutes });
  }
  return translateLabel('ui.duration.daysHours', t, { days, hours: remHours });
}

/**
 * Ngày giờ dạng đọc được, **một định dạng thống nhất toàn hệ thống**: `dd/MM/yyyy HH:mm`.
 * Trùng khớp với chuỗi định dạng của `DatePipe` (`| date: 'dd/MM/yyyy HH:mm'`) đang dùng khắp nơi,
 * nên cùng một trang không còn lệch giữa chỗ dùng pipe và chỗ dùng hàm này. Có số 0 đứng đầu và
 * năm 4 chữ số; **không phụ thuộc locale** để mọi ngôn ngữ hiển thị giống nhau (giờ theo máy người
 * dùng, giống DatePipe). Gom bản chép định dạng rời rạc ở nhiều trang về một mối.
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '—';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Mã lực lượng Kiểm dịch — bước tiên quyết của cụm khi có cờ dịch tễ (CR2). Khớp agencyCode BE. */
export const QUARANTINE_AGENCY_CODE = 'QUARANTINE';

/** Ba lực lượng chủ trì các bước kiểm tra nghiệp vụ (cụm song song CR44). Khớp agencyCode BE. */
export const INSPECTION_AGENCY_CODES = ['BORDER_GUARD', 'CUSTOMS', QUARANTINE_AGENCY_CODE];

/** Bốn mã bước cổng VÀO/RA cửa khẩu (CR7/28/30) do Biên phòng xác nhận tại Barrie. */
export const GATE_STEP_CODES = ['IMPORT_B1_ENTRY', 'IMPORT_B2_EXIT', 'EXPORT_B2_ENTRY', 'EXPORT_B1_EXIT'];

/** Bước cổng VÀO hoặc RA cửa khẩu — nhận biết bằng cờ gate hoặc mã bước cổng cố định. */
export function isGateStep(step: { code: string; gate?: GateDirection | null }): boolean {
  if (step.gate) return true;
  return GATE_STEP_CODES.includes(step.code);
}

/** Bước kiểm tra nghiệp vụ (thuộc cụm song song): do 3 lực lượng chủ trì và KHÔNG phải bước cổng. */
export function isInspectionStep(step: WorkflowStep): boolean {
  return !isGateStep(step) && INSPECTION_AGENCY_CODES.includes(step.agencyCode);
}

/**
 * CR2 — khi hồ sơ có cờ dịch tễ, đưa bước Kiểm dịch (nghiệp vụ) lên TRƯỚC các bước nghiệp vụ khác
 * trong cùng cụm để **hiển thị**. Chỉ đổi thứ tự trình bày, không đụng thứ tự xử lý ở BE. Nhận diện
 * bằng mã lực lượng (ASCII tập đóng), không dò chuỗi hiển thị.
 */
export function orderStepsForDisplay(steps: readonly WorkflowStep[], epidemic: boolean): WorkflowStep[] {
  const list = [...steps];
  if (!epidemic) return list;
  const inspectionOrders = list.filter(isInspectionStep).map((step) => step.order);
  if (!inspectionOrders.length) return list;
  const minOrder = Math.min(...inspectionOrders);
  const displayOrder = (step: WorkflowStep): number =>
    isInspectionStep(step) && step.agencyCode === QUARANTINE_AGENCY_CODE ? minOrder - 0.5 : step.order;
  return list.sort((left, right) => displayOrder(left) - displayOrder(right));
}

/** Nhóm checklist thành các cột theo cơ quan (Biên phòng / Hải quan / Kiểm dịch). */
export interface ChecklistColumn {
  agencyCode: string;
  agencyName: string;
  icon: string;
  step: WorkflowStep | null;
  items: WorkflowChecklistItem[];
}

/**
 * Thứ tự cột lấy theo `order` của bước tương ứng để cột trên màn hình đúng thứ tự
 * quy trình; cơ quan không có bước nào thì xếp cuối, giữ nguyên thứ tự API trả.
 */
export function buildChecklistColumns(
  checklist: readonly WorkflowChecklistItem[],
  steps: readonly WorkflowStep[],
  t?: Translate,
): ChecklistColumn[] {
  const columns: ChecklistColumn[] = [];

  (checklist || []).forEach((item) => {
    let column = columns.find((entry) => entry.agencyCode === item.agencyCode);
    if (!column) {
      const step = (steps || []).find((entry) => entry.agencyCode === item.agencyCode && !isGateStep(entry))
        || (steps || []).find((entry) => entry.agencyCode === item.agencyCode)
        || null;
      column = {
        agencyCode: item.agencyCode,
        agencyName: agencyLabel(item.agencyCode, step?.agencyName || '', t),
        icon: agencyIcon(item.agencyCode),
        step,
        items: [],
      };
      columns.push(column);
    }
    column.items.push(item);
  });

  (steps || [])
    .filter((step) => isInspectionStep(step))
    .forEach((step) => {
      const column = columns.find((entry) => entry.agencyCode === step.agencyCode);
      if (!column) {
        columns.push({
          agencyCode: step.agencyCode,
          agencyName: agencyLabel(step.agencyCode, step.agencyName || '', t),
          icon: agencyIcon(step.agencyCode),
          step,
          items: [],
        });
      }
    });

  return columns.sort((a, b) => stepOrder(a.step) - stepOrder(b.step));
}

function stepOrder(step: WorkflowStep | null): number {
  return typeof step?.order === 'number' ? step.order : Number.MAX_SAFE_INTEGER;
}
