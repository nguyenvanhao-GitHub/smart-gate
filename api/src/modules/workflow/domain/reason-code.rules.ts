import { MessageKey } from '../../../common/i18n/message-catalog';
import { translate } from '../../../common/i18n/translate';
import { ReasonScope } from '../../catalog/domain/reason-code.catalog';
import { WorkflowDecision } from './workflow.enums';

/**
 * Nhóm danh mục mã lý do gắn với từng quyết định (CR37): yêu cầu sửa đổi, bổ sung → `SUPPLEMENT`,
 * từ chối → `REJECT`. Bảng này **không** còn nghĩa "bắt buộc" — mã lý do nay **tùy chọn** (xem
 * `requiresReasonCode`); nó chỉ dùng để (1) biết mã lý do đã chọn thuộc nhóm nào mà **thẩm định tính
 * hợp lệ**, và (2) để web nạp đúng danh mục cho ô chọn. Điều chỉnh phí (F47) dùng chung danh mục qua
 * `ReasonScope` ở phân hệ phí.
 */
export const DECISION_REASON_SCOPES: Partial<Record<WorkflowDecision, ReasonScope>> = {
  [WorkflowDecision.REQUEST_SUPPLEMENT]: ReasonScope.SUPPLEMENT,
  [WorkflowDecision.REJECT]: ReasonScope.REJECT,
};

/**
 * CR37 — **nội dung lý do (ghi chú) bắt buộc** với "yêu cầu sửa đổi, bổ sung" và "từ chối"; xác nhận
 * hoàn thành không cần. Đây là ràng buộc thay cho mã lý do (nay tùy chọn): người xử lý phải nêu rõ
 * bằng lời vì sao trả/từ chối hồ sơ, lưu vào lịch sử cho doanh nghiệp đọc.
 */
const REASON_NOTE_REQUIRED_DECISIONS: ReadonlySet<WorkflowDecision> = new Set([
  WorkflowDecision.REQUEST_SUPPLEMENT,
  WorkflowDecision.REJECT,
]);

export function requiresReasonNote(decision: WorkflowDecision): boolean {
  return REASON_NOTE_REQUIRED_DECISIONS.has(decision);
}

/** Thông báo 400 khi thiếu nội dung lý do bắt buộc. */
export function missingReasonNoteMessage(decision: WorkflowDecision): ReasonRuleMessage {
  return { messageKey: 'workflow.reasonNoteRequired', messageParams: { decision: DECISION_LABEL_KEYS[decision] } };
}

export function reasonScopeFor(decision: WorkflowDecision): ReasonScope | undefined {
  return DECISION_REASON_SCOPES[decision];
}

/**
 * CR37 — **mã lý do KHÔNG còn bắt buộc** với bất kỳ quyết định nào (trước đây bắt buộc với bổ sung/từ
 * chối). Giữ hàm để tầng use-case gọi ổn định; nếu về sau có quyết định cần mã bắt buộc thì khai ở đây.
 */
export function requiresReasonCode(_decision: WorkflowDecision): boolean {
  return false;
}

/**
 * Nhãn thao tác là **lời văn hệ thống** nên nằm trong từ điển, không phải hằng chuỗi.
 * Truyền chính khóa vào `messageParams` để nó được dịch lồng theo ngôn ngữ người dùng.
 */
export const DECISION_LABEL_KEYS: Record<WorkflowDecision, MessageKey> = {
  [WorkflowDecision.APPROVE]: 'workflow.decision.APPROVE',
  [WorkflowDecision.REQUEST_SUPPLEMENT]: 'workflow.decision.REQUEST_SUPPLEMENT',
  [WorkflowDecision.REJECT]: 'workflow.decision.REJECT',
};

/** Nhãn tiếng Việt của thao tác — dùng cho log, ghi vết và các chỗ cần chuỗi sẵn. */
export const DECISION_LABELS: Record<WorkflowDecision, string> = Object.freeze(
  Object.fromEntries(
    Object.entries(DECISION_LABEL_KEYS).map(([decision, key]) => [decision, translate(key)]),
  ) as Record<WorkflowDecision, string>,
);

/** Khóa + tham số của một thông báo 400 do quy tắc mã nguyên nhân sinh ra. */
export interface ReasonRuleMessage {
  messageKey: MessageKey;
  messageParams?: Record<string, string | number>;
}

/** Thông báo 400 khi thiếu mã lý do bắt buộc. */
export function missingReasonCodeMessage(decision: WorkflowDecision): ReasonRuleMessage {
  return { messageKey: 'workflow.reasonCodeRequired', messageParams: { decision: DECISION_LABEL_KEYS[decision] } };
}

/** Thông báo 400 khi mã lý do không có trong danh mục hoặc đã bị khóa. */
export function invalidReasonCodeMessage(reasonCode: string): ReasonRuleMessage {
  return { messageKey: 'workflow.reasonCodeInvalid', messageParams: { reasonCode } };
}
