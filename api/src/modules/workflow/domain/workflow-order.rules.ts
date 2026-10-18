import { MessageKey, MessageParams } from '../../../common/i18n/message-catalog';
import { translate } from '../../../common/i18n/translate';
import { DeclarationStatus } from '../../declarations/domain/declaration.enums';
import { isInspectionStep } from '../../declarations/domain/workflow-step.catalog';
import { WorkflowInstance } from './workflow-instance.entity';
import { QUARANTINE_AGENCY_CODE, WorkflowRoute } from './workflow-route';
import { WorkflowDecision, WorkflowInstanceStatus, WorkflowStepStatus } from './workflow.enums';

/**
 * Quy tắc **thứ tự bước** của quy trình liên ngành (F18, DoD mốc M2).
 *
 * Đặt ở `domain/` và viết dưới dạng hàm thuần để test được không cần HTTP/DB: chặn thao tác sai
 * thứ tự phải là quy tắc nghiệp vụ, **không** phải chuyện ẩn nút trên giao diện. Tầng application
 * dịch `kind` sang mã HTTP tương ứng.
 */
export type StepOrderViolationKind =
  /** Mã bước không thuộc lộ trình của loại hồ sơ này → 400. */
  | 'UNKNOWN_STEP'
  /** Phiên đã đóng (đã từ chối hoặc đã hoàn tất) → 409. */
  | 'FLOW_CLOSED'
  /** Bước đã có kết luận rồi, không quyết định lại → 409. */
  | 'ALREADY_DECIDED'
  /** Chưa tới lượt bước này, hoặc đã đi qua → 409. */
  | 'OUT_OF_ORDER'
  /** Bước cổng (vào/ra) do sự kiện cổng (F38/F44) hoàn thành, không quyết định qua liên ngành → 409. */
  | 'GATE_STEP'
  /** CR2 — có cờ dịch tễ: Biên phòng/Hải quan đòi xử lý trước khi Kiểm dịch hoàn thành → 409. */
  | 'QUARANTINE_PRIORITY'
  /** Bước đang ở trạng thái chờ doanh nghiệp bổ sung thông tin → cán bộ không quyết định tiếp → 409/403. */
  | 'STEP_WAITING_SUPPLEMENT'
  /** Xe đang ở trạng thái Chờ gọi (chưa được Điều phối gọi vào kiểm tra) → 409. */
  | 'WAITING_CALL'
  /** Vai trò hiện tại không được thao tác bước này → 403. */
  | 'ROLE_NOT_ALLOWED';

export interface StepOrderViolation {
  kind: StepOrderViolationKind;
  /** Lời văn tiếng Việt — giữ lại để log server và client cũ vẫn đọc được nghĩa. */
  message: string;
  /** Khóa thông báo để client tự dịch (hợp đồng đa ngữ). */
  messageKey: MessageKey;
  messageParams?: MessageParams;
}

/** Dựng vi phạm: khóa là chính, lời văn tiếng Việt được sinh ra từ khóa nên hai thứ không lệch nhau. */
function violation(
  kind: StepOrderViolationKind,
  messageKey: MessageKey,
  messageParams?: MessageParams,
): StepOrderViolation {
  return { kind, messageKey, messageParams, message: translate(messageKey, messageParams) };
}

/**
 * Kiểm tra một yêu cầu quyết định có hợp lệ về thứ tự hay không (CR44/CR2 — mô hình tập bước mở).
 *
 * "Đúng lượt" nay = **bước đang mở** (đang xử lý / chờ bổ sung), không còn so con trỏ đơn: trong cụm
 * nghiệp vụ nhiều bước mở song song đều hợp lệ, không ràng buộc thứ tự nội bộ. Ranh giới bị chặn 409:
 * bước còn PENDING (chưa tới giai đoạn của nó — vd đòi nghiệp vụ khi chưa qua cổng vào, đòi thu phí/cổng
 * ra khi cụm chưa xong), và **QUARANTINE_PRIORITY** khi có cờ dịch tễ mà đòi Biên phòng/Hải quan trước
 * Kiểm dịch. Trả `null` là hợp lệ; trả violation là phải chặn.
 */
export function checkStepOrder(
  route: WorkflowRoute,
  instance: WorkflowInstance,
  stepCode: string,
  epidemic = false,
  dossierStatus?: DeclarationStatus,
): StepOrderViolation | null {
  const target = route.find(stepCode);
  if (!target) {
    return violation('UNKNOWN_STEP', 'workflow.unknownStep', {
      step: stepCode,
      dossierType: instance.dossierType,
    });
  }

  if (instance.status === WorkflowInstanceStatus.REJECTED) {
    return violation('FLOW_CLOSED', 'workflow.flowRejected');
  }
  if (instance.status === WorkflowInstanceStatus.COMPLETED) {
    return violation('FLOW_CLOSED', 'workflow.flowCompleted');
  }

  const state = instance.step(stepCode);
  if (state && (state.status === WorkflowStepStatus.COMPLETED || state.status === WorkflowStepStatus.REJECTED)) {
    return violation('ALREADY_DECIDED', 'workflow.alreadyDecided', { step: target.name });
  }

  // Bước đang chờ doanh nghiệp bổ sung thông tin → cán bộ KHÔNG được quyết định tiếp cho tới khi nộp lại.
  if (state && state.status === WorkflowStepStatus.WAITING_SUPPLEMENT) {
    return violation('STEP_WAITING_SUPPLEMENT', 'workflow.waitingSupplement', { step: target.name });
  }

  // Xe đang ở trạng thái Chờ gọi (hoặc Chờ vào cổng) → chưa được Điều phối gọi xe vào kiểm tra, không được duyệt bước nghiệp vụ.
  if (
    isInspectionStep(stepCode) &&
    (dossierStatus === DeclarationStatus.WAITING_CALL || dossierStatus === DeclarationStatus.WAITING_GATE)
  ) {
    return violation('WAITING_CALL', 'workflow.waitingCall');
  }

  // Bước đang xử lý là hợp lệ.
  if (state && state.status === WorkflowStepStatus.IN_PROGRESS) {
    return null;
  }

  // Bước còn PENDING → chưa tới lượt. CR2 — phân biệt riêng trường hợp bị chặn bởi ưu tiên kiểm dịch.
  if (
    epidemic &&
    isInspectionStep(stepCode) &&
    target.agencyCode !== QUARANTINE_AGENCY_CODE &&
    !quarantineCompleted(route, instance)
  ) {
    return violation('QUARANTINE_PRIORITY', 'workflow.quarantinePriorityRequired', { step: target.name });
  }

  const expected = instance.currentStepCode ? route.find(instance.currentStepCode) : undefined;
  // Tên bước/lực lượng là **dữ liệu danh mục** nên truyền thẳng, không dịch; chỉ nhánh "không xác
  // định được bước" mới là lời văn hệ thống nên truyền dưới dạng khóa để dịch lồng.
  const expectedName = expected ? `"${expected.name}" (${expected.agencyName})` : 'workflow.nextStepFallback';
  return violation('OUT_OF_ORDER', 'workflow.outOfOrder', { expected: expectedName, step: target.name });
}

/** Kiểm bước Kiểm dịch của cụm đã hoàn thành chưa (CR2). */
function quarantineCompleted(route: WorkflowRoute, instance: WorkflowInstance): boolean {
  const quarantine = route.quarantineInspectionStep;
  return !!quarantine && instance.step(quarantine.code)?.status === WorkflowStepStatus.COMPLETED;
}

/** Kiểm cả thứ tự lẫn vai trò. Vai trò được kiểm **sau** thứ tự để thông báo nói đúng nguyên nhân gốc. */
export function checkStepAction(
  route: WorkflowRoute,
  instance: WorkflowInstance,
  stepCode: string,
  roleCodes: string[],
  epidemic = false,
  dossierStatus?: DeclarationStatus,
): StepOrderViolation | null {
  const orderViolation = checkStepOrder(route, instance, stepCode, epidemic, dossierStatus);
  if (orderViolation) return orderViolation;

  // Bước cổng ra không quyết định qua `POST /workflow/.../decide`: xe qua cổng là **sự kiện cổng**
  // (F38/F44), đường duy nhất khép bước này và đặt hồ sơ sang EXITED→COMPLETED. Kiểm **trước** vai
  // trò để dù đúng lực lượng cổng vẫn nhận đúng nguyên nhân "bước này do cổng hoàn thành".
  if (route.isGateStep(stepCode)) {
    return violation('GATE_STEP', 'workflow.gateStepNotDecidable', { step: route.find(stepCode)?.name ?? stepCode });
  }

  if (!route.allowsRole(stepCode, roleCodes)) {
    const step = route.find(stepCode);
    return violation('ROLE_NOT_ALLOWED', 'workflow.roleNotAllowed', {
      step: step?.name ?? stepCode,
      agency: step?.agencyName ?? 'workflow.otherAgency',
    });
  }
  return null;
}

/**
 * Các quyết định người đang đăng nhập được phép gửi lên (CR36 — 3 lựa chọn).
 *
 * Tính ở máy chủ theo **quyền + vai trò + đúng bước hiện tại**, không trả bừa rồi để web tự lọc:
 * - không có `workflow.approve` → không xác nhận hoàn thành/từ chối được;
 * - chỉ có `workflow.update` → còn được yêu cầu sửa đổi, bổ sung;
 * - sai bước, sai vai trò hoặc đang ở bước cổng → không có quyết định nào.
 */
export function availableDecisions(
  route: WorkflowRoute,
  instance: WorkflowInstance,
  permissions: string[],
  roleCodes: string[],
  epidemic = false,
  dossierStatus?: DeclarationStatus,
): WorkflowDecision[] {
  // Hồ sơ có bước đang chờ doanh nghiệp bổ sung thông tin → khóa toàn bộ quyền quyết định của cán bộ cho tới khi nộp lại.
  if (
    instance.status === WorkflowInstanceStatus.WAITING_SUPPLEMENT ||
    instance.steps.some((step) => step.status === WorkflowStepStatus.WAITING_SUPPLEMENT)
  ) {
    return [];
  }

  const decisions: WorkflowDecision[] = [];
  const canApprove = permissions.includes('workflow.approve');
  const canUpdate = canApprove || permissions.includes('workflow.update');

  // CR44 — tính theo **bước mở của chính vai trò người dùng**: duyệt qua tập bước đang mở, lấy bước
  // đầu tiên mà thao tác hợp lệ (đúng lượt + đúng vai trò + không phải bước cổng). Nhờ vậy trong cụm
  // song song, mỗi lực lượng vẫn thấy đúng lựa chọn của bước mình dù bước đại diện là của lực lượng khác.
  const actionable = instance.activeStepCodes.some(
    (stepCode) => !checkStepAction(route, instance, stepCode, roleCodes, epidemic, dossierStatus),
  );

  if (actionable) {
    if (canApprove) decisions.push(WorkflowDecision.APPROVE);
    if (canUpdate) decisions.push(WorkflowDecision.REQUEST_SUPPLEMENT);
    if (canApprove) decisions.push(WorkflowDecision.REJECT);
  }
  return decisions;
}
