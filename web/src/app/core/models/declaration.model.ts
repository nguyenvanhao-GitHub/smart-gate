// =============================================================================
// Mô hình hồ sơ điện tử (P2 — UI-03 danh sách, UI-04 khai báo, UI-05 chi tiết).
// Khớp contract API `/declarations` + `/files`.
//
// Quy ước đặt tên: `Dossier*` theo contract API. Trạng thái và loại hình là
// **danh mục cấu hình được** (SRS 7.2) nên mọi hàm nhãn đều nhận `string` và có
// giá trị dự phòng — thêm mã mới ở BE không làm vỡ giao diện.
// =============================================================================

import { MessageKey } from '../i18n/message-catalog';
import { Translate, translateCode, translateLabel } from './label.util';

export type DossierType = 'EXPORT' | 'IMPORT' | 'TRANSSHIPMENT_EXPORT' | 'TRANSSHIPMENT_IMPORT' | 'SELF_PROPELLED';

/** Giữ tên cũ cho các màn hình đã có (tác nghiệp, thu phí). */
export type DeclarationType = DossierType;

/** Mã loại hồ sơ → khóa từ điển dự phòng. Danh mục chính thức được nạp qua CatalogsController (`type_code = 'DOSSIER_TYPE'`). */
export const DOSSIER_TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  EXPORT: 'ui.dossierType.EXPORT',
  IMPORT: 'ui.dossierType.IMPORT',
  TRANSSHIPMENT_EXPORT: 'ui.dossierType.TRANSSHIPMENT_EXPORT',
  TRANSSHIPMENT_IMPORT: 'ui.dossierType.TRANSSHIPMENT_IMPORT',
  SELF_PROPELLED: 'ui.dossierType.SELF_PROPELLED',
};

export function dossierTypeLabel(type: string, t?: Translate, fallbackName?: string): string {
  const key = DOSSIER_TYPE_LABEL_KEYS[type];
  if (key) return translateLabel(key, t);
  return fallbackName || type || '—';
}

/**
 * Hướng di chuyển suy từ loại hồ sơ — mã ASCII tập đóng `IN`/`OUT` (không dò chuỗi hiển thị).
 * Nhập khẩu/chuyển tải/xe tự hành coi là vào (`IN`); xuất khẩu là ra (`OUT`). Mã lạ mặc định `IN`.
 */
export type MovementDirection = 'IN' | 'OUT';

const DOSSIER_DIRECTION_BY_TYPE: Record<string, MovementDirection> = {
  IMPORT: 'IN',
  EXPORT: 'OUT',
  TRANSSHIPMENT_EXPORT: 'OUT',
  TRANSSHIPMENT_IMPORT: 'IN',
  SELF_PROPELLED: 'IN',
};

export function dossierDirection(type: string): MovementDirection {
  return DOSSIER_DIRECTION_BY_TYPE[type] ?? 'IN';
}

/** Khóa nhãn hướng di chuyển theo mã. */
export const DOSSIER_DIRECTION_LABEL_KEYS: Record<MovementDirection, MessageKey> = {
  IN: 'ui.detail.directionIn',
  OUT: 'ui.detail.directionOut',
};

export function dossierDirectionLabel(type: string, t?: Translate): string {
  const direction = dossierDirection(type);
  return translateCode(DOSSIER_DIRECTION_LABEL_KEYS[direction], direction, t);
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
export type DossierStatus =
  | 'DRAFT'
  | 'WAITING_GATE'
  | 'WAITING_CALL'
  | 'BUSINESS_PROCESSING'
  | 'REVISION_REQUIRED'
  | 'WAITING_FOR_FEE'
  | 'READY_FOR_EXIT'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  // Legacy / aliases
  | 'SUBMITTED'
  | 'PROCESSING'
  | 'IN_PROGRESS'
  | 'NEED_SUPPLEMENT'
  | 'WAITING_BORDER_GUARD'
  | 'WAITING_CUSTOMS'
  | 'WAITING_QUARANTINE'
  | 'APPROVED'
  | 'PAID'
  | 'WORKFLOW_DONE'
  | 'EXITED'
  | 'CLOSED'
  | 'REOPENED';

export type DeclarationStatus = DossierStatus;

export const DOSSIER_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  DRAFT: 'ui.dossierStatus.DRAFT',
  WAITING_GATE: 'ui.dossierStatus.WAITING_GATE',
  WAITING_CALL: 'ui.dossierStatus.WAITING_CALL',
  BUSINESS_PROCESSING: 'ui.dossierStatus.BUSINESS_PROCESSING',
  REVISION_REQUIRED: 'ui.dossierStatus.REVISION_REQUIRED',
  WAITING_FOR_FEE: 'ui.dossierStatus.WAITING_FOR_FEE',
  READY_FOR_EXIT: 'ui.dossierStatus.READY_FOR_EXIT',
  COMPLETED: 'ui.dossierStatus.COMPLETED',
  REJECTED: 'ui.dossierStatus.REJECTED',
  CANCELLED: 'ui.dossierStatus.CANCELLED',

  // Legacy fallbacks
  SUBMITTED: 'ui.dossierStatus.SUBMITTED',
  PROCESSING: 'ui.dossierStatus.PROCESSING',
  IN_PROGRESS: 'ui.dossierStatus.IN_PROGRESS',
  WAITING_BORDER_GUARD: 'ui.dossierStatus.WAITING_BORDER_GUARD',
  WAITING_CUSTOMS: 'ui.dossierStatus.WAITING_CUSTOMS',
  WAITING_QUARANTINE: 'ui.dossierStatus.WAITING_QUARANTINE',
  NEED_SUPPLEMENT: 'ui.dossierStatus.NEED_SUPPLEMENT',
  APPROVED: 'ui.dossierStatus.APPROVED',
  PAID: 'ui.dossierStatus.PAID',
  WORKFLOW_DONE: 'ui.dossierStatus.WORKFLOW_DONE',
  EXITED: 'ui.dossierStatus.EXITED',
  CLOSED: 'ui.dossierStatus.CLOSED',
  REOPENED: 'ui.dossierStatus.REOPENED',
};

/**
 * Màu trạng thái theo SRS 8.1: xanh dương `processing` (đang xử lý) · xanh lá `done` (xong) ·
 * vàng `waiting` (chờ tới lượt) · cam `warning` (cần bổ sung/khai lại) ·
 * đỏ `rejected` (từ chối/hủy) · xám `idle` (chưa tới lượt).
 */
export type DossierStatusTone = 'processing' | 'done' | 'waiting' | 'warning' | 'rejected' | 'idle';

export const DOSSIER_STATUS_TONES: Record<string, DossierStatusTone> = {
  DRAFT: 'idle',
  WAITING_GATE: 'waiting',
  WAITING_CALL: 'waiting',
  BUSINESS_PROCESSING: 'processing',
  REVISION_REQUIRED: 'warning',
  WAITING_FOR_FEE: 'waiting',
  READY_FOR_EXIT: 'done',
  COMPLETED: 'done',
  REJECTED: 'rejected',
  CANCELLED: 'rejected',

  // Legacy fallbacks
  SUBMITTED: 'waiting',
  PROCESSING: 'processing',
  IN_PROGRESS: 'processing',
  WAITING_BORDER_GUARD: 'waiting',
  WAITING_CUSTOMS: 'waiting',
  WAITING_QUARANTINE: 'waiting',
  NEED_SUPPLEMENT: 'warning',
  APPROVED: 'done',
  PAID: 'done',
  WORKFLOW_DONE: 'done',
  EXITED: 'done',
  CLOSED: 'idle',
  REOPENED: 'processing',
};

export function dossierStatusLabel(status: string, t?: Translate): string {
  return translateCode(DOSSIER_STATUS_LABEL_KEYS[status], status, t);
}

export function dossierStatusTone(status: string): DossierStatusTone {
  return DOSSIER_STATUS_TONES[status] || 'idle';
}

/**
 * Nhóm trạng thái (mã đóng) cho bộ lọc danh sách — khớp `DeclarationStatusGroup` của API. Đích của
 * drilldown KPI "Đang xử lý nghiệp vụ": danh sách gửi `statusGroup` để số dòng khớp đúng con số trên thẻ.
 */
export const DOSSIER_STATUS_GROUPS = ['BUSINESS_PROCESS', 'IN_PROGRESS'] as const;
export type DossierStatusGroup = (typeof DOSSIER_STATUS_GROUPS)[number];

export const DOSSIER_STATUS_GROUP_LABEL_KEYS: Record<string, MessageKey> = {
  BUSINESS_PROCESS: 'ui.dossierStatusGroup.BUSINESS_PROCESS',
  IN_PROGRESS: 'ui.dossierStatusGroup.IN_PROGRESS',
};

/** Giá trị của ô lọc trạng thái là một mã NHÓM (khác trạng thái đơn) hay không — tập đóng, không dò chuỗi. */
export function isDossierStatusGroup(value: string): value is DossierStatusGroup {
  return (DOSSIER_STATUS_GROUPS as readonly string[]).includes(value);
}

export function dossierStatusGroupLabel(group: string, t?: Translate): string {
  return translateCode(DOSSIER_STATUS_GROUP_LABEL_KEYS[group], group, t);
}

/** F15 — chỉ hồ sơ nháp hoặc đang bị yêu cầu bổ sung mới được sửa. */
export const EDITABLE_DOSSIER_STATUSES = ['DRAFT', 'NEED_SUPPLEMENT', 'REVISION_REQUIRED'];

export function isDossierEditable(status: string): boolean {
  return EDITABLE_DOSSIER_STATUSES.includes(status);
}

/** Chỉ hồ sơ chưa gửi mới xóa được — hồ sơ đã gửi phải hủy theo quy trình. */
export function isDossierDeletable(status: string): boolean {
  return status === 'DRAFT';
}

/** SG-209: Doanh nghiệp chỉ được phép hủy hồ sơ khi ở trạng thái Chờ vào cổng (xe chưa duyệt vào cổng). */
export const CANCELABLE_DOSSIER_STATUSES = ['WAITING_GATE', 'SUBMITTED'];

export function isDossierCancelable(status: string): boolean {
  const s = (status || '').toUpperCase().trim();
  return CANCELABLE_DOSSIER_STATUSES.includes(s);
}

/**
 * Chốt/cửa kiểm soát — mã tập đóng `CheckpointCode` của BE (`declaration.enums.ts`):
 * `B1`/`B2`/`B5`/`YARD`/`SMART_GATE`. Nhãn bám wording BE (`reports/domain/report.catalog.ts`).
 * Mã lạ do BE thêm mới vẫn hiện được (rơi về chính mã đó).
 */
export const CHECKPOINT_LABEL_KEYS: Record<string, MessageKey> = {
  A1: 'ui.checkpoint.A1',
  A2: 'ui.checkpoint.A2',
  B1: 'ui.checkpoint.B1',
  B2: 'ui.checkpoint.B2',
  B5: 'ui.checkpoint.B5',
  YARD: 'ui.checkpoint.YARD',
  SMART_GATE: 'ui.checkpoint.SMART_GATE',
};

/** Nhãn chốt/cửa theo mã (dùng cho cả `checkpoint` lẫn `appointment.gateCode`); rỗng → '—'. */
export function checkpointLabel(code: string | null | undefined, t?: Translate, fallbackName?: string): string {
  if (!code) return '—';
  const key = CHECKPOINT_LABEL_KEYS[code];
  if (key) return translateLabel(key, t);
  return fallbackName || code;
}

/**
 * Chốt/cửa kiểm soát dùng cho bộ lọc — đúng tập enum thật của BE để bộ lọc khớp dữ liệu.
 * Khi API có danh mục dùng chung (F04) thì thay bằng dữ liệu từ BE (D8).
 */
export const CHECKPOINT_OPTIONS: Array<{ value: string; labelKey: MessageKey }> = [
  { value: 'A1', labelKey: 'ui.checkpoint.A1' },
  { value: 'A2', labelKey: 'ui.checkpoint.A2' },
  { value: 'B1', labelKey: 'ui.checkpoint.B1' },
  { value: 'B2', labelKey: 'ui.checkpoint.B2' },
  { value: 'B5', labelKey: 'ui.checkpoint.B5' },
  { value: 'YARD', labelKey: 'ui.checkpoint.YARD' },
  { value: 'SMART_GATE', labelKey: 'ui.checkpoint.SMART_GATE' },
];

/** Danh sách chốt cho ô lọc, đã dịch theo ngôn ngữ đang chọn. */
export function checkpointOptions(t?: Translate): Array<{ value: string; label: string }> {
  return CHECKPOINT_OPTIONS.map((item) => ({ value: item.value, label: translateLabel(item.labelKey, t) }));
}

/** Loại phương tiện — khóa dịch i18n theo mã enum. */
export const VEHICLE_TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  TRUCK: 'ui.vehicleType.TRUCK',
  CONTAINER: 'ui.vehicleType.CONTAINER',
  TRACTOR: 'ui.vehicleType.TRACTOR',
  TANKER: 'ui.vehicleType.TANKER',
  EMPTY: 'ui.vehicleType.EMPTY',
};

export function vehicleTypeLabel(type?: string, t?: Translate, fallbackName?: string): string {
  if (!type) return '—';
  const key = VEHICLE_TYPE_LABEL_KEYS[type];
  if (key) return translateLabel(key, t);
  return fallbackName || type || '—';
}

/** Tên và icon của từng lực lượng — dùng cho stepper ngang ở UI-05. */
export const FORCE_LABEL_KEYS: Record<string, MessageKey> = {
  customs: 'ui.force.customs',
  borderGuard: 'ui.force.borderGuard',
  healthQuarantine: 'ui.force.healthQuarantine',
  plantQuarantine: 'ui.force.plantQuarantine',
  animalQuarantine: 'ui.force.animalQuarantine',
  taxFee: 'ui.force.taxFee',
  economicZoneFee: 'ui.force.economicZoneFee',
};

export const FORCE_ICONS: Record<string, string> = {
  customs: 'account_balance',
  borderGuard: 'shield',
  healthQuarantine: 'health_and_safety',
  plantQuarantine: 'local_florist',
  animalQuarantine: 'pets',
  taxFee: 'payments',
  economicZoneFee: 'receipt_long',
};

export function forceLabel(force: string, t?: Translate): string {
  return translateCode(FORCE_LABEL_KEYS[force], force, t);
}

export function forceIcon(force: string): string {
  return FORCE_ICONS[force] || 'task_alt';
}

export const FORCE_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  COMPLETED: 'ui.forceStatus.COMPLETED',
  NOT_APPLICABLE: 'ui.forceStatus.NOT_APPLICABLE',
  PENDING: 'ui.forceStatus.PENDING',
  PROCESSING: 'ui.forceStatus.PROCESSING',
  REVISION_REQUIRED: 'ui.forceStatus.REVISION_REQUIRED',
  FAILED: 'ui.forceStatus.FAILED',
  CANCELLED: 'ui.forceStatus.CANCELLED',
};

export function forceStatusLabel(status = 'PENDING', t?: Translate): string {
  return translateCode(FORCE_STATUS_LABEL_KEYS[status], status, t);
}

// --- Thực thể ----------------------------------------------------------------

export interface DossierEnterprise {
  taxCode?: string;
  name?: string;
  representativeName?: string;
  address?: string;
  phone?: string;
  email?: string;
  username?: string;
  jobTitle?: string;
  department?: string;
  accountType?: string;
  idNumber?: string;
  createForOther?: boolean;
}

export type EnterpriseIdentifierKind = 'TAX_CODE' | 'ID_NUMBER' | 'EMAIL' | 'INTERNAL_CODE';

export interface EnterpriseIdentifierInfo {
  kind: EnterpriseIdentifierKind;
  labelKey: MessageKey;
  value: string;
}

export function resolveEnterpriseIdentifier(
  enterprise?: Partial<DossierEnterprise> | null,
): EnterpriseIdentifierInfo {
  const type = (enterprise?.accountType || '').trim().toUpperCase();
  const taxCode = (enterprise?.taxCode || '').trim();
  const idNumber = (enterprise?.idNumber || '').trim();
  const email = (enterprise?.email || '').trim();

  // 1. Khi có accountType rõ ràng: luôn ưu tiên theo accountType
  if (type === 'ENTERPRISE') {
    return {
      kind: 'TAX_CODE',
      labelKey: 'ui.common.taxCode',
      value: taxCode,
    };
  }

  if (type === 'INDIVIDUAL') {
    return {
      kind: 'ID_NUMBER',
      labelKey: 'ui.form.idNumber',
      value: idNumber || taxCode,
    };
  }

  if (type === 'INTERNAL') {
    if (email) {
      return {
        kind: 'EMAIL',
        labelKey: 'ui.common.email',
        value: email,
      };
    }
    if (taxCode) {
      return {
        kind: 'INTERNAL_CODE',
        labelKey: 'ui.form.codeInternal',
        value: taxCode,
      };
    }
    return {
      kind: 'EMAIL',
      labelKey: 'ui.common.email',
      value: '',
    };
  }

  // 2. Hồ sơ cũ (chưa có accountType): dựa vào dữ liệu thực tế và heuristic
  if (idNumber || /^(?:\d{9}|\d{12})$/.test(taxCode)) {
    return {
      kind: 'ID_NUMBER',
      labelKey: 'ui.form.idNumber',
      value: idNumber || taxCode,
    };
  }

  if (!taxCode && email) {
    return {
      kind: 'EMAIL',
      labelKey: 'ui.common.email',
      value: email,
    };
  }

  return {
    kind: 'TAX_CODE',
    labelKey: 'ui.common.taxCode',
    value: taxCode,
  };
}

export function resolveEnterpriseNameLabelKey(
  enterprise?: Partial<DossierEnterprise> | null,
): MessageKey {
  const type = (enterprise?.accountType || '').trim().toUpperCase();
  const taxCode = (enterprise?.taxCode || '').trim();
  const idNumber = (enterprise?.idNumber || '').trim();

  if (type === 'INDIVIDUAL' || (!type && (idNumber || /^(?:\d{9}|\d{12})$/.test(taxCode)))) {
    return 'ui.form.fullNameIndividual';
  }

  if (type === 'INTERNAL') {
    return 'ui.form.nameInternal';
  }

  return 'ui.form.enterpriseName';
}

export function formatEnterpriseIdentifierPrefix(
  enterprise: Partial<DossierEnterprise> | null | undefined,
  t: Translate,
): string {
  const resolved = resolveEnterpriseIdentifier(enterprise);
  if (!resolved.value) return '—';
  if (resolved.kind === 'TAX_CODE') {
    return t('ui.dossier.taxCodePrefix', { taxCode: resolved.value });
  }
  if (resolved.kind === 'EMAIL') {
    return resolved.value;
  }
  return `${t(resolved.labelKey)}: ${resolved.value}`;
}

export interface DossierDriver {
  fullName: string;
  idNumber: string;
  idType?: string;
  phone?: string;
  licenseNumber?: string;
  nationality?: string;
}

export interface DossierVehicle {
  /** Khóa của bảng `vehicles` — có khi hồ sơ đã lưu; gửi lại để cập nhật không tạo bản mới. */
  id?: string;
  plateNumber: string;
  containerNumber?: string;
  trailerNumber?: string;
  transportLicenseNumber?: string;
  vehicleType?: string;
  weightKg?: number;
  /** Lái xe của chính xe này (BUG-033) — mỗi phương tiện gắn một lái xe. */
  driver?: DossierDriver | null;
}

export interface CargoItem {
  id: string;
  description: string;
  cargoTypeCode?: string;
  quantity?: number;
  unitCode?: string;
  grossWeightKg?: number;
}

/**
 * Phương tiện nhận sang tải (CR9/CR18/CR33) — chỉ có ở hồ sơ loại Sang tải (TRANSSHIPMENT).
 * Lái xe theo mockup chỉ là **tên** (`driverName`), khác lái xe của phương tiện vận chuyển.
 */
export interface TransshipmentVehicle {
  id?: string;
  /** Biển số xe chở hàng gốc (chọn từ phương tiện của hồ sơ). */
  sourcePlate?: string;
  plateNumber: string;
  vehicleType?: string;
  containerNumber?: string;
  trailerNumber?: string;
  driverName?: string;
  fee01?: string;
  transferPlace?: string;
  note?: string;
}

export interface DossierAppointment {
  id?: string;
  scheduledAt?: string;
  gateCode?: string;
  laneCode?: string;
  status?: string;
}

/**
 * Chứng từ bắt buộc theo loại hồ sơ (D7 / F13).
 * `GET /catalog/required-documents?dossierType=` trả danh sách này; web đối chiếu với
 * tệp đã đính kèm để đánh dấu đã đủ / còn thiếu.
 */
export interface RequiredDocument {
  documentTypeCode: string;
  documentTypeName: string;
  required: boolean;
}

/**
 * Loại chứng từ trong danh mục dùng chung (F04).
 * `GET /catalog/document-types` trả danh sách này; web đổ vào ô chọn khi đính kèm tệp thay cho
 * danh sách cứng, nhờ đó mã gửi lên luôn nằm trong danh mục và không bị API từ chối.
 */
export interface DocumentTypeOption {
  code: string;
  name: string;
}

export interface DossierAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  documentTypeCode?: string;
  documentTypeName?: string;
  uploadedAt?: string;
  uploadedBy?: string;
}

export interface DossierAuditEvent {
  id: string;
  at: string;
  actorId?: string;
  actorRole?: string;
  action: string;
  note?: string;
  fromStatus?: string;
  toStatus?: string;
}

/** Dòng trong danh sách UI-03 — `GET /declarations`. */
export interface DossierSummary {
  id: string;
  code: string;
  type: string;
  status: string;
  enterprise: DossierEnterprise;
  /** Xe đầu — giữ cho danh sách/màn cũ hiển thị nhanh. Danh sách đầy đủ ở `vehicles`. */
  vehicle: DossierVehicle;
  vehicles: DossierVehicle[];
  driver: DossierDriver | null;
  cargoSummary: string;
  checkpoint?: string;
  /** CR2 — cờ ưu tiên kiểm dịch (dịch tễ). Bật một chiều tại cổng vào; web hiện badge/lọc "Dịch tễ". */
  epidemicFlag?: boolean;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
}

/** Giữ tên cũ cho màn tác nghiệp đã có. */
export type DeclarationSummary = DossierSummary;

/**
 * Một bước trong phiên xử lý liên ngành THẬT của hồ sơ — mirror `DossierWorkflowStep` của API
 * (`declarations/application/dto/dossier-view.dto.ts`). Nguồn để mục 6 UI-05 vẽ stepper và bảng
 * lịch sử; ngày giờ đã tuần tự hóa thành chuỗi ISO khi qua HTTP.
 */
export interface DossierWorkflowStep {
  code: string;
  order: number;
  name: string;
  agencyCode: string;
  agencyName: string;
  gate?: 'ENTRY' | 'EXIT' | null;
  status: string;
  actorName?: string | null;
  /** Mã vai trò người xác nhận — hiện API luôn trả `null` (phiên chỉ lưu tên); giữ làm nhãn dự phòng. */
  actorRole?: string | null;
  enteredAt?: string | null;
  completedAt?: string | null;
  decision?: string | null;
  note?: string | null;
}

export interface DossierWorkflowHistoryItem {
  id: string;
  stepCode: string;
  process: string;
  agencyCode?: string;
  agencyName?: string;
  decision: string;
  actorName?: string | null;
  actorRole?: string | null;
  actedAt: string;
  note?: string | null;
  reasonCode?: string | null;
  elapsedSeconds?: number;
}

/** Chi tiết UI-05 — `GET /declarations/:id`. */
export interface DossierDetail extends DossierSummary {
  cargoItems: CargoItem[];
  /** Phương tiện nhận sang tải (CR9) — rỗng khi hồ sơ không phải loại Sang tải. */
  transshipmentVehicles?: TransshipmentVehicle[];
  appointment: DossierAppointment | null;
  attachments: DossierAttachment[];
  feeDeclarationCode?: string;
  workflowProgress?: Record<string, string>;
  auditTrail?: DossierAuditEvent[];
  /** Tiến trình liên ngành thật (mục 6) — rỗng/thiếu khi hồ sơ chưa vào quy trình. */
  workflowSteps?: DossierWorkflowStep[];
  /** Lịch sử quyết định xử lý liên ngành đầy đủ (SG-116). */
  workflowHistory?: DossierWorkflowHistoryItem[];
  /**
   * Hồ sơ đã tới bước thu phí chưa (đang ở hoặc đã đi qua) — do BE tính theo luật liên ngành. Gate lối
   * vào màn thu phí (UI-11): fail-closed, thiếu cờ ⇒ coi như chưa tới, ẩn nút. Không tự suy từ
   * `workflowSteps`.
   */
  feeStepReached?: boolean;
  qrCode?: string;
  /** CR12 — thời điểm xe qua cổng vào (nhập cảnh) / cổng ra (xuất cảnh), đọc từ `gate_events` ở BE. */
  entryAt?: string | null;
  exitAt?: string | null;
}

// --- Bộ lọc và payload -------------------------------------------------------

export interface DossierFilters {
  keyword?: string;
  type?: string;
  status?: string;
  /** Lọc theo NHÓM trạng thái (mã đóng, vd `IN_PROGRESS`) — API đổi thành `status IN (...)`. */
  statusGroup?: string;
  checkpoint?: string;
  /** CR2 — chỉ hồ sơ có cờ ưu tiên kiểm dịch (dịch tễ). */
  epidemic?: boolean;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** Dòng hàng hóa khi gửi lên API — hàng mới chưa có `id`. */
export type CargoItemPayload = Omit<CargoItem, 'id'> & { id?: string };

export interface DossierDraftPayload {
  type: string;
  checkpoint?: string;
  enterprise: DossierEnterprise;
  /** Một phương tiện vận chuyển/hồ sơ (CR8), kèm lái xe. Cho trùng biển giữa các hồ sơ. */
  vehicles: DossierVehicle[];
  cargoItems?: CargoItemPayload[];
  /** Phương tiện nhận sang tải (CR9) — chỉ gửi khi loại hồ sơ là Sang tải. */
  transshipmentVehicles?: TransshipmentVehicle[];
  appointment?: DossierAppointment | null;
  feeDeclarationCode?: string;
}

/** Lỗi API trả kèm tên trường — dùng để tô đỏ đúng ô trên biểu mẫu (F13). */
export interface DossierFieldError {
  field: string;
  /** Lời văn API gửi kèm — luôn có, dùng khi web chưa có bản dịch cho khóa. */
  message: string;
  /** Khóa thông báo (nếu API gửi) để web tự dịch sang ngôn ngữ đang chọn. */
  messageKey?: string;
  messageParams?: Record<string, string | number | boolean | null | undefined>;
}

export interface DossierSubmitResult {
  code: string;
  qrCode: string;
  submittedAt: string;
}
