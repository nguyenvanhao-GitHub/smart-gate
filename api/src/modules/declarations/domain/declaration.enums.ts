export enum DeclarationType {
  EXPORT = 'EXPORT',
  IMPORT = 'IMPORT',
  TRANSSHIPMENT_EXPORT = 'TRANSSHIPMENT_EXPORT',
  TRANSSHIPMENT_IMPORT = 'TRANSSHIPMENT_IMPORT',
  SELF_PROPELLED = 'SELF_PROPELLED',
}

/**
 * Trạng thái hồ sơ chuẩn hoá gồm 10 mã trạng thái chính thức:
 * 1. DRAFT - Bản nháp
 * 2. WAITING_GATE - Chờ vào cổng
 * 3. WAITING_CALL - Chờ gọi
 * 4. BUSINESS_PROCESSING - Đang xử lý nghiệp vụ
 * 5. REVISION_REQUIRED - Cần bổ sung
 * 6. WAITING_FOR_FEE - Chờ thanh toán
 * 7. READY_FOR_EXIT - Chờ ra cổng
 * 8. COMPLETED - Hoàn thành
 * 9. REJECTED - Từ chối
 * 10. CANCELLED - Đã hủy
 */
export enum DeclarationStatus {
  /** Bản nháp: Hồ sơ mới tạo, chưa gửi đi xử lý. */
  DRAFT = 'DRAFT',
  /** Chờ vào cổng: Hồ sơ đã được gửi, chờ phương tiện đến cổng để kiểm tra và xác nhận vào. */
  WAITING_GATE = 'WAITING_GATE',
  /** Chờ gọi: Đã vào bãi, đang chờ điều phối gọi để kiểm tra. */
  WAITING_CALL = 'WAITING_CALL',
  /** Đang xử lý nghiệp vụ: Đang được xử lý nghiệp vụ kiểm tra tại bãi/cụm (Biên phòng, ...). */
  BUSINESS_PROCESSING = 'BUSINESS_PROCESSING',
  /** Cần bổ sung: Hồ sơ/thông tin cần bổ sung, hoàn thiện theo yêu cầu. */
  REVISION_REQUIRED = 'REVISION_REQUIRED',
  /** Chờ thanh toán: Đã có kết quả nghiệp vụ, chờ thanh toán phí/lệ phí (nếu có). */
  WAITING_FOR_FEE = 'WAITING_FOR_FEE',
  /** Chờ ra cổng: Đã hoàn tất nghiệp vụ, sẵn sàng ra cổng. */
  READY_FOR_EXIT = 'READY_FOR_EXIT',
  /** Hoàn thành: Phương tiện đã ra khỏi cửa khẩu, hồ sơ kết thúc thành công. */
  COMPLETED = 'COMPLETED',
  /** Từ chối: Hồ sơ bị từ chối cho qua cửa khẩu. */
  REJECTED = 'REJECTED',
  /** Đã hủy: Hồ sơ bị hủy bỏ theo yêu cầu hoặc do không tiếp tục thực hiện. */
  CANCELLED = 'CANCELLED',

  // === Tương thích ngược dữ liệu cũ / legacy ===
  SUBMITTED = 'SUBMITTED',
  PROCESSING = 'PROCESSING',
  WAITING_BORDER_GUARD = 'WAITING_BORDER_GUARD',
  WAITING_CUSTOMS = 'WAITING_CUSTOMS',
  WAITING_QUARANTINE = 'WAITING_QUARANTINE',
  PAID = 'PAID',
  EXITED = 'EXITED',
}

/** Tên trong SRS/legacy → mã dùng trong hệ thống. */
export const SRS_STATUS_ALIASES: Record<string, DeclarationStatus> = {
  SUBMITTED: DeclarationStatus.WAITING_GATE,
  IN_PROGRESS: DeclarationStatus.BUSINESS_PROCESSING,
  PROCESSING: DeclarationStatus.BUSINESS_PROCESSING,
  NEED_SUPPLEMENT: DeclarationStatus.REVISION_REQUIRED,
  WAITING_BORDER_GUARD: DeclarationStatus.BUSINESS_PROCESSING,
  WAITING_CUSTOMS: DeclarationStatus.BUSINESS_PROCESSING,
  WAITING_QUARANTINE: DeclarationStatus.BUSINESS_PROCESSING,
  WAITING_FEE: DeclarationStatus.WAITING_FOR_FEE,
  PAID: DeclarationStatus.READY_FOR_EXIT,
  EXITED: DeclarationStatus.COMPLETED,
};

/** Nhãn tiếng Việt của trạng thái hồ sơ — một nơi duy nhất để mọi phân hệ hiển thị giống nhau. */
export const DECLARATION_STATUS_LABELS: Record<DeclarationStatus, string> = {
  [DeclarationStatus.DRAFT]: 'Bản nháp',
  [DeclarationStatus.WAITING_GATE]: 'Chờ vào cổng',
  [DeclarationStatus.WAITING_CALL]: 'Chờ gọi',
  [DeclarationStatus.BUSINESS_PROCESSING]: 'Đang xử lý nghiệp vụ',
  [DeclarationStatus.REVISION_REQUIRED]: 'Cần bổ sung',
  [DeclarationStatus.WAITING_FOR_FEE]: 'Chờ thanh toán',
  [DeclarationStatus.READY_FOR_EXIT]: 'Chờ ra cổng',
  [DeclarationStatus.COMPLETED]: 'Hoàn thành',
  [DeclarationStatus.REJECTED]: 'Từ chối',
  [DeclarationStatus.CANCELLED]: 'Đã hủy',

  // Legacy fallbacks
  [DeclarationStatus.SUBMITTED]: 'Chờ vào cổng',
  [DeclarationStatus.PROCESSING]: 'Đang xử lý nghiệp vụ',
  [DeclarationStatus.WAITING_BORDER_GUARD]: 'Chờ Biên phòng',
  [DeclarationStatus.WAITING_CUSTOMS]: 'Chờ Hải quan',
  [DeclarationStatus.WAITING_QUARANTINE]: 'Chờ Kiểm dịch',
  [DeclarationStatus.PAID]: 'Đã thanh toán',
  [DeclarationStatus.EXITED]: 'Đã rời cửa khẩu',
};

/** Mô tả ngữ cảnh gắn trạng thái hồ sơ theo chuẩn quy trình. */
export const DECLARATION_STATUS_DESCRIPTIONS: Record<DeclarationStatus, string> = {
  [DeclarationStatus.DRAFT]: 'Hồ sơ mới tạo, chưa gửi đi xử lý.',
  [DeclarationStatus.WAITING_GATE]: 'Hồ sơ đã được gửi, chờ phương tiện đến cổng để kiểm tra và xác nhận vào.',
  [DeclarationStatus.WAITING_CALL]: 'Đã vào bãi, đang chờ điều phối gọi để kiểm tra.',
  [DeclarationStatus.BUSINESS_PROCESSING]: 'Đang được xử lý nghiệp vụ kiểm tra tại bãi/cụm (Biên phòng, ...).',
  [DeclarationStatus.REVISION_REQUIRED]: 'Hồ sơ/thông tin cần bổ sung, hoàn thiện theo yêu cầu.',
  [DeclarationStatus.WAITING_FOR_FEE]: 'Đã có kết quả nghiệp vụ, chờ thanh toán phí/lệ phí (nếu có).',
  [DeclarationStatus.READY_FOR_EXIT]: 'Đã hoàn tất nghiệp vụ, sẵn sàng ra cổng.',
  [DeclarationStatus.COMPLETED]: 'Phương tiện đã ra khỏi cửa khẩu, hồ sơ kết thúc thành công.',
  [DeclarationStatus.REJECTED]: 'Hồ sơ bị từ chối cho qua cửa khẩu.',
  [DeclarationStatus.CANCELLED]: 'Hồ sơ bị hủy bỏ theo yêu cầu hoặc do không tiếp tục thực hiện.',

  // Legacy fallbacks
  [DeclarationStatus.SUBMITTED]: 'Hồ sơ đã được gửi, chờ phương tiện đến cổng để kiểm tra và xác nhận vào.',
  [DeclarationStatus.PROCESSING]: 'Đang được xử lý nghiệp vụ kiểm tra tại bãi/cụm (Biên phòng, ...).',
  [DeclarationStatus.WAITING_BORDER_GUARD]: 'Đang chờ Biên phòng kiểm tra.',
  [DeclarationStatus.WAITING_CUSTOMS]: 'Đang chờ Hải quan kiểm tra.',
  [DeclarationStatus.WAITING_QUARANTINE]: 'Đang chờ Kiểm dịch kiểm tra.',
  [DeclarationStatus.PAID]: 'Đã hoàn tất thanh toán phí.',
  [DeclarationStatus.EXITED]: 'Phương tiện đã ra khỏi cửa khẩu.',
};

/** Nhóm `WAITING_*`: hồ sơ đang nằm chờ vào cổng, chờ gọi, chờ thu phí hoặc chờ ra cổng. */
export const WAITING_STATUSES: DeclarationStatus[] = [
  DeclarationStatus.WAITING_GATE,
  DeclarationStatus.WAITING_CALL,
  DeclarationStatus.WAITING_FOR_FEE,
  DeclarationStatus.READY_FOR_EXIT,
];

/**
 * Nhóm "Đang xử lý nghiệp vụ" theo vòng đời thật: hồ sơ đã vào bãi và đang trong các bước nghiệp vụ liên ngành.
 *
 * ⚠️ Một hằng dùng chung cho cả KPI dashboard ("Đang xử lý nghiệp vụ") lẫn bộ lọc danh sách hồ sơ (statusGroup).
 */
export const IN_PROGRESS_STATUSES: DeclarationStatus[] = [
  DeclarationStatus.WAITING_CALL,
  DeclarationStatus.BUSINESS_PROCESSING,
  DeclarationStatus.REVISION_REQUIRED,
  DeclarationStatus.WAITING_FOR_FEE,
  DeclarationStatus.READY_FOR_EXIT,
];

/**
 * Trạng thái hồ sơ đã hoàn tất toàn bộ bước liên ngành chuyên ngành.
 */
export const POST_INTERAGENCY_STATUSES: DeclarationStatus[] = [
  DeclarationStatus.WAITING_FOR_FEE,
  DeclarationStatus.READY_FOR_EXIT,
  DeclarationStatus.COMPLETED,
];

/** Mã nhóm trạng thái (tập đóng ASCII) cho bộ lọc danh sách + drilldown KPI. */
export enum DeclarationStatusGroup {
  BUSINESS_PROCESS = 'BUSINESS_PROCESS',
}

/** Mỗi mã nhóm ứng với đúng một danh sách trạng thái con — nguồn duy nhất cho cả FE lẫn BE. */
export const DECLARATION_STATUS_GROUPS: Record<DeclarationStatusGroup, DeclarationStatus[]> = {
  [DeclarationStatusGroup.BUSINESS_PROCESS]: IN_PROGRESS_STATUSES,
};

/** Đổi mã nhóm sang danh sách trạng thái; mã ngoài tập đóng trả `undefined` (không lọc trạng thái). */
export function statusesForGroup(group?: string): DeclarationStatus[] | undefined {
  if (!group) return undefined;
  return DECLARATION_STATUS_GROUPS[group as DeclarationStatusGroup];
}

export enum ForceStatus {
  NOT_APPLICABLE = 'NOT_APPLICABLE',
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REVISION_REQUIRED = 'REVISION_REQUIRED',
  CANCELLED = 'CANCELLED',
}

export enum WorkflowStepCode {
  EXPORT_DECLARED = 'EXPORT_DECLARED',
  EXPORT_B2_ENTRY = 'EXPORT_B2_ENTRY',
  EXPORT_CUSTOMS = 'EXPORT_CUSTOMS',
  EXPORT_QUARANTINE = 'EXPORT_QUARANTINE',
  EXPORT_BORDER = 'EXPORT_BORDER',
  EXPORT_FEE = 'EXPORT_FEE',
  EXPORT_B1_EXIT = 'EXPORT_B1_EXIT',
  IMPORT_DECLARED = 'IMPORT_DECLARED',
  IMPORT_B1_ENTRY = 'IMPORT_B1_ENTRY',
  IMPORT_BORDER = 'IMPORT_BORDER',
  IMPORT_QUARANTINE = 'IMPORT_QUARANTINE',
  IMPORT_CUSTOMS = 'IMPORT_CUSTOMS',
  IMPORT_FEE = 'IMPORT_FEE',
  IMPORT_B2_EXIT = 'IMPORT_B2_EXIT',
}

export enum CheckpointCode {
  A1 = 'A1',
  A2 = 'A2',
  B1 = 'B1',
  B2 = 'B2',
  B5 = 'B5',
  YARD = 'YARD',
  SMART_GATE = 'SMART_GATE',
}

/** Trạng thái lịch hẹn qua cửa khẩu (bảng `appointments`). */
export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  ARRIVED = 'ARRIVED',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
}

export enum DeclarationAction {
  CREATE_DRAFT = 'CREATE_DRAFT',
  SUBMIT = 'SUBMIT',
  RESUBMIT = 'RESUBMIT',
  REQUEST_REVISION = 'REQUEST_REVISION',
  CUSTOMS_CONFIRM = 'CUSTOMS_CONFIRM',
  BORDER_GUARD_CONFIRM = 'BORDER_GUARD_CONFIRM',
  QUARANTINE_CONFIRM = 'QUARANTINE_CONFIRM',
  FEE_CONFIRM = 'FEE_CONFIRM',
  FEE_CANCEL = 'FEE_CANCEL',
  FEE_MERGE = 'FEE_MERGE',
  OPERATION_ACTION = 'OPERATION_ACTION',
  COMPLETE = 'COMPLETE',
  CANCEL = 'CANCEL',
}
