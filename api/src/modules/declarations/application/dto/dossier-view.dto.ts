import {
  AuditEntry,
  Declaration,
  WorkflowProgress,
} from '../../domain/declaration.entity';
import {
  AppointmentStatus,
  CheckpointCode,
  DeclarationAction,
  DeclarationStatus,
  DeclarationType,
} from '../../domain/declaration.enums';
import { AgencyAction } from '../../../workflow/domain/agency-action.entity';
import { WorkflowInstance } from '../../../workflow/domain/workflow-instance.entity';
import { WorkflowRoute } from '../../../workflow/domain/workflow-route';
import { WorkflowDecision, WorkflowStepStatus } from '../../../workflow/domain/workflow.enums';
import { GatePassageTimes, NO_GATE_PASSAGE } from '../../../../common/gate/gate-passage.port';
import { GateStepDirection } from '../../domain/workflow-step.catalog';
import { DossierAttachmentView } from '../ports/dossier-attachment.port';

/**
 * Hợp đồng dữ liệu trả cho web. Đặt ở `application/` để controller chỉ còn việc map HTTP,
 * và để tên trường không phụ thuộc vào cấu trúc bảng.
 */
export interface DossierSummary {
  id: string;
  code: string;
  type: DeclarationType;
  status: DeclarationStatus;
  enterprise: {
    taxCode: string;
    name: string;
    idNumber?: string | null;
    email?: string | null;
    accountType?: string | null;
  };
  /** Xe đầu — giữ cho danh sách/màn cũ hiển thị nhanh. Danh sách đầy đủ ở `vehicles`. */
  vehicle: { plateNumber: string; containerNumber: string | null; trailerNumber: string | null };
  vehicles: Array<{ plateNumber: string; containerNumber: string | null; trailerNumber: string | null }>;
  driver: { fullName: string; idNumber: string } | null;
  /** Gộp mô tả các dòng hàng để hiển thị gọn trong một cột của bảng danh sách. */
  cargoSummary: string;
  checkpoint: CheckpointCode;
  /** CR2 — cờ ưu tiên kiểm dịch (dịch tễ). Bật một chiều tại cổng vào; web hiện badge/lọc "Dịch tễ". */
  epidemicFlag: boolean;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
}

export interface DossierDetail extends Omit<DossierSummary, 'enterprise' | 'vehicle' | 'vehicles' | 'driver'> {
  enterprise: {
    taxCode: string;
    name: string;
    representativeName: string | null;
    address: string | null;
    phone: string | null;
    email?: string | null;
    idNumber?: string | null;
    accountType?: string | null;
    jobTitle?: string | null;
    department?: string | null;
    createForOther?: boolean | null;
  };
  vehicle: DossierVehicleView;
  vehicles: DossierVehicleView[];
  driver: {
    fullName: string;
    idNumber: string;
    idType: string | null;
    phone: string | null;
    licenseNumber: string | null;
    nationality: string | null;
  } | null;
  cargoItems: Array<{
    id: string | null;
    cargoTypeCode: string | null;
    description: string;
    quantity: number | null;
    unitCode: string | null;
    grossWeightKg: number | null;
  }>;
  /** Phương tiện nhận sang tải (CR9/CR18/CR33) — rỗng khi hồ sơ không phải loại Sang tải. */
  transshipmentVehicles: DossierTransshipmentVehicleView[];
  appointment: {
    id: string | null;
    scheduledAt: Date;
    gateCode: string | null;
    laneCode: string | null;
    status: AppointmentStatus;
  } | null;
  attachments: DossierAttachmentView[];
  feeDeclarationCode: string | null;
  workflowProgress: WorkflowProgress;
  auditTrail: AuditEntry[];
  /**
   * Tiến trình xử lý liên ngành **thật** của hồ sơ (bảng `workflow_instances`/`..._steps`) — nguồn
   * để màn chi tiết (UI-05, mục 6) vẽ stepper.
   */
  workflowSteps: DossierWorkflowStep[];
  /**
   * Lịch sử thao tác và quyết định xử lý hồ sơ (SG-116) — hiển thị đầy đủ các quyết định
   * (Xác nhận hoàn thành, Yêu cầu sửa đổi bổ sung, Từ chối, Nộp hồ sơ) kèm thời gian, cán bộ, ghi chú.
   */
  workflowHistory: DossierWorkflowHistoryItem[];
  /**
   * Hồ sơ đã **tới bước thu phí** trong phiên xử lý liên ngành chưa (đang ở hoặc đã đi qua). Phản chiếu
   * đúng luật ở BE (`workflow/domain/fee-step-gate.rules.hasReachedFeeStep`) để web quyết định có mở lối
   * vào màn thu phí (UI-11) hay không — không cho tiếp cận thu phí trước bước phí. Hồ sơ chưa có phiên
   * (nháp/chưa nộp) hoặc lộ trình không có bước phí → `false` (fail-closed).
   */
  feeStepReached: boolean;
  qrCode: string | null;
  /**
   * CR12 — thời điểm xe qua **cổng vào** (nhập cảnh) và **cổng ra** (xuất cảnh), đọc từ `gate_events`
   * (sự kiện CHO QUA), KHÔNG lưu cột riêng. `null` khi hồ sơ chưa có lượt cổng tương ứng.
   */
  entryAt: Date | null;
  exitAt: Date | null;
}

/**
 * Một bản ghi lịch sử xử lý của hồ sơ (SG-116).
 */
export interface DossierWorkflowHistoryItem {
  id: string;
  stepCode: string;
  process: string;
  agencyCode: string;
  agencyName: string;
  decision: string;
  actorName: string | null;
  actorRole: string | null;
  actedAt: Date;
  note: string | null;
  reasonCode: string | null;
  elapsedSeconds?: number;
}

/**
 * Một bước trong phiên xử lý liên ngành, đã lắp tên bước/tên cơ quan từ lộ trình và kèm dấu vết
 * quyết định gần nhất (ai xác nhận, lúc nào, quyết định gì, ghi chú). Dùng cho mục 6 của UI-05.
 */
export interface DossierWorkflowStep {
  code: string;
  order: number;
  name: string;
  agencyCode: string;
  agencyName: string;
  gate: GateStepDirection | null;
  status: WorkflowStepStatus;
  actorName: string | null;
  /**
   * Mã vai trò RBAC của người xác nhận — hiện **luôn `null`** vì phiên/nhật ký chỉ lưu *tên* người
   * thao tác (`actorName`), không lưu mã vai trò. Giữ trong hợp đồng để web có chỗ dự phòng nhãn.
   */
  actorRole: string | null;
  enteredAt: Date | null;
  completedAt: Date | null;
  decision: WorkflowDecision | null;
  note: string | null;
}

/** Lái xe hiển thị cho màn chi tiết — nhúng theo từng phương tiện (BUG-033). */
export interface DossierDriverView {
  fullName: string;
  idNumber: string;
  idType: string | null;
  phone: string | null;
  licenseNumber: string | null;
  nationality: string | null;
}

/** Phương tiện nhận sang tải cho màn chi tiết (CR9). Lái xe chỉ là tên (#S1). */
export interface DossierTransshipmentVehicleView {
  id: string | null;
  sourcePlate: string | null;
  plateNumber: string;
  vehicleType: string | null;
  containerNumber: string | null;
  trailerNumber: string | null;
  driverName: string | null;
  fee01: string | null;
  transferPlace: string | null;
  note: string | null;
}

/** Phương tiện đầy đủ cho màn chi tiết — nhiều xe trên một hồ sơ, mỗi xe một lái xe. */
export interface DossierVehicleView {
  plateNumber: string;
  containerNumber: string | null;
  trailerNumber: string | null;
  transportLicenseNumber: string | null;
  vehicleType: string | null;
  weightKg: number | null;
  driver: DossierDriverView | null;
}

function nullable<T>(value: T | undefined | null): T | null {
  return value ?? null;
}

/** Rút gọn phương tiện cho danh sách (biển số + container/moóc). */
function toVehicleSummary(vehicle: { plateNumber?: string; containerNumber?: string; trailerNumber?: string }) {
  return {
    plateNumber: vehicle.plateNumber ?? '',
    containerNumber: nullable(vehicle.containerNumber),
    trailerNumber: nullable(vehicle.trailerNumber),
  };
}

/** Lái xe của một phương tiện cho màn chi tiết; rỗng khi xe chưa khai lái xe. */
function toDriverView(driver?: {
  fullName?: string;
  idNumber?: string;
  idType?: string;
  phone?: string;
  licenseNumber?: string;
  nationality?: string;
} | null): DossierDriverView | null {
  if (!driver) return null;
  return {
    fullName: driver.fullName ?? '',
    idNumber: driver.idNumber ?? '',
    idType: nullable(driver.idType),
    phone: nullable(driver.phone),
    licenseNumber: nullable(driver.licenseNumber),
    nationality: nullable(driver.nationality),
  };
}

/** Phương tiện đầy đủ cho màn chi tiết, kèm lái xe của chính xe đó. */
function toVehicleView(vehicle: {
  plateNumber?: string;
  containerNumber?: string;
  trailerNumber?: string;
  transportLicenseNumber?: string;
  vehicleType?: string;
  weightKg?: number;
  driver?: {
    fullName?: string;
    idNumber?: string;
    idType?: string;
    phone?: string;
    licenseNumber?: string;
    nationality?: string;
  } | null;
}): DossierVehicleView {
  return {
    plateNumber: vehicle.plateNumber ?? '',
    containerNumber: nullable(vehicle.containerNumber),
    trailerNumber: nullable(vehicle.trailerNumber),
    transportLicenseNumber: nullable(vehicle.transportLicenseNumber),
    vehicleType: nullable(vehicle.vehicleType),
    weightKg: nullable(vehicle.weightKg),
    driver: toDriverView(vehicle.driver),
  };
}

/** Gộp mô tả dòng hàng: "Nông sản tổng hợp; Máy nông nghiệp". Rỗng khi hồ sơ chưa khai hàng. */
export function buildCargoSummary(declaration: Declaration): string {
  return declaration.cargoItems
    .map((item) => item.description?.trim())
    .filter((description): description is string => !!description)
    .join('; ');
}

export function toDossierSummary(declaration: Declaration): DossierSummary {
  return {
    id: declaration.id,
    code: declaration.code,
    type: declaration.type,
    status: declaration.status,
    enterprise: {
      taxCode: declaration.enterprise?.taxCode ?? '',
      name: declaration.enterprise?.name ?? '',
      idNumber: declaration.enterprise?.idNumber ?? null,
      email: declaration.enterprise?.email ?? null,
      accountType: declaration.enterprise?.accountType ?? null,
    },
    vehicle: toVehicleSummary(declaration.vehicles[0] ?? {}),
    vehicles: declaration.vehicles.map(toVehicleSummary),
    driver: declaration.driver
      ? { fullName: declaration.driver.fullName, idNumber: declaration.driver.idNumber }
      : null,
    cargoSummary: buildCargoSummary(declaration),
    checkpoint: declaration.checkpoint,
    epidemicFlag: declaration.epidemicFlag,
    createdAt: declaration.createdAt,
    updatedAt: declaration.updatedAt,
    submittedAt: declaration.submittedAt,
  };
}

/**
 * Lắp danh sách bước của phiên xử lý liên ngành với tên bước/tên cơ quan trong lộ trình.
 * Sắp theo `order` để stepper và bảng lịch sử chạy đúng thứ tự quy trình.
 */
export function toWorkflowStepViews(instance: WorkflowInstance, route: WorkflowRoute): DossierWorkflowStep[] {
  return [...instance.steps]
    .sort((left, right) => left.order - right.order)
    .map((state) => {
      const definition = route.find(state.stepCode);
      return {
        code: state.stepCode,
        order: state.order,
        name: definition?.name ?? state.stepCode,
        agencyCode: definition?.agencyCode ?? '',
        agencyName: definition?.agencyName ?? '',
        gate: definition?.gate ?? null,
        status: state.status,
        actorName: state.actorName,
        actorRole: null,
        enteredAt: state.enteredAt,
        completedAt: state.completedAt,
        decision: state.decision,
        note: state.reasonNote,
      };
    });
}

export function toWorkflowHistoryViews(
  declaration: Declaration,
  actions: AgencyAction[] = [],
  route: WorkflowRoute,
  workflowSteps: DossierWorkflowStep[] = [],
): DossierWorkflowHistoryItem[] {
  const history: DossierWorkflowHistoryItem[] = [];

  let hasSubmitFromAudit = false;
  if (declaration.auditTrail && declaration.auditTrail.length > 0) {
    for (const entry of declaration.auditTrail) {
      const act = String(entry.action);
      const isResubmit = act === DeclarationAction.RESUBMIT || act === 'RESUBMIT';
      const isSubmit = act === DeclarationAction.SUBMIT || act === 'SUBMIT';
      if (isSubmit || isResubmit) {
        if (isSubmit) {
          hasSubmitFromAudit = true;
        }
        history.push({
          id: entry.id || `${declaration.id}-${entry.action}-${new Date(entry.at).getTime()}`,
          stepCode: isResubmit ? 'DECLARATION_RESUBMIT' : 'DECLARATION_SUBMIT',
          process: isResubmit ? 'Doanh nghiệp bổ sung hồ sơ' : 'Doanh nghiệp khai báo',
          agencyCode: '',
          agencyName: '',
          decision: 'SUBMITTED',
          actorName: declaration.enterprise?.name || declaration.driver?.fullName || 'Doanh nghiệp',
          actorRole: null,
          actedAt: entry.at,
          note: entry.note || null,
          reasonCode: null,
        });
      }
    }
  }

  // Thao tác nộp hồ sơ của doanh nghiệp (fallback nếu auditTrail chưa có bản ghi SUBMIT)
  if (!hasSubmitFromAudit && declaration.submittedAt) {
    history.push({
      id: `${declaration.id}-submit`,
      stepCode: 'DECLARATION_SUBMIT',
      process: 'Doanh nghiệp khai báo',
      agencyCode: '',
      agencyName: '',
      decision: 'SUBMITTED',
      actorName: declaration.enterprise?.name || declaration.driver?.fullName || 'Doanh nghiệp',
      actorRole: null,
      actedAt: declaration.submittedAt,
      note: null,
      reasonCode: null,
    });
  }

  if (actions && actions.length > 0) {
    // Toàn bộ quyết định từ bảng agency_actions (APPROVE, REQUEST_SUPPLEMENT, REJECT)
    for (const action of actions) {
      const stepDef = route.find(action.stepCode);
      history.push({
        id: action.id,
        stepCode: action.stepCode,
        process: stepDef?.name ?? action.stepCode,
        agencyCode: action.agencyCode || stepDef?.agencyCode || '',
        agencyName: stepDef?.agencyName || '',
        decision: action.decision,
        actorName: action.actorName,
        actorRole: null,
        actedAt: action.actedAt,
        note: action.reasonNote,
        reasonCode: action.reasonCode,
        elapsedSeconds: action.elapsedSeconds,
      });
    }
  } else if (workflowSteps && workflowSteps.length > 0) {
    // Trường hợp dự phòng nếu chưa có agency_actions (dữ liệu cũ)
    for (const step of workflowSteps) {
      if (step.decision || step.completedAt || step.actorName || step.status === 'COMPLETED') {
        history.push({
          id: `${declaration.id}-${step.code}`,
          stepCode: step.code,
          process: step.name || step.agencyName || step.code,
          agencyCode: step.agencyCode,
          agencyName: step.agencyName,
          decision: step.decision || (step.status === 'COMPLETED' ? 'APPROVE' : step.status),
          actorName: step.actorName,
          actorRole: step.actorRole,
          actedAt: step.completedAt || step.enteredAt || declaration.createdAt,
          note: step.note,
          reasonCode: null,
        });
      }
    }
  }

  // Sắp xếp mới nhất lên trước
  return history.sort((left, right) => new Date(right.actedAt).getTime() - new Date(left.actedAt).getTime());
}

const PII_KEYS = new Set([
  'accountType',
  'idNumber',
  'email',
  'name',
  'phone',
  'address',
  'representativeName',
  'jobTitle',
  'department',
  'createForOther',
]);

function sanitizeWorkflowProgress(progress?: WorkflowProgress | Record<string, unknown> | null): WorkflowProgress {
  if (!progress || typeof progress !== 'object') return {};
  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(progress)) {
    if (!PII_KEYS.has(key)) {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export function toDossierDetail(
  declaration: Declaration,
  attachments: DossierAttachmentView[] = [],
  workflowSteps: DossierWorkflowStep[] = [],
  feeStepReached = false,
  passage: GatePassageTimes = NO_GATE_PASSAGE,
  workflowHistory: DossierWorkflowHistoryItem[] = [],
): DossierDetail {
  const summary = toDossierSummary(declaration);
  return {
    ...summary,
    enterprise: {
      taxCode: declaration.enterprise?.taxCode ?? '',
      name: declaration.enterprise?.name ?? '',
      representativeName: nullable(declaration.enterprise?.representativeName),
      address: nullable(declaration.enterprise?.address),
      phone: nullable(declaration.enterprise?.phone),
      email: nullable(declaration.enterprise?.email),
      idNumber: nullable(declaration.enterprise?.idNumber),
      accountType: nullable(declaration.enterprise?.accountType),
      jobTitle: nullable(declaration.enterprise?.jobTitle),
      department: nullable(declaration.enterprise?.department),
      createForOther: declaration.enterprise?.createForOther ?? null,
    },
    vehicle: toVehicleView(declaration.vehicles[0] ?? {}),
    vehicles: declaration.vehicles.map(toVehicleView),
    driver: declaration.driver
      ? {
          fullName: declaration.driver.fullName,
          idNumber: declaration.driver.idNumber,
          idType: nullable(declaration.driver.idType),
          phone: nullable(declaration.driver.phone),
          licenseNumber: nullable(declaration.driver.licenseNumber),
          nationality: nullable(declaration.driver.nationality),
        }
      : null,
    cargoItems: declaration.cargoItems.map((item) => ({
      id: nullable(item.id),
      cargoTypeCode: nullable(item.cargoTypeCode),
      description: item.description,
      quantity: nullable(item.quantity),
      unitCode: nullable(item.unitCode),
      grossWeightKg: nullable(item.grossWeightKg),
    })),
    transshipmentVehicles: declaration.transshipmentVehicles.map((item) => ({
      id: nullable(item.id),
      sourcePlate: nullable(item.sourcePlate),
      plateNumber: item.plateNumber,
      vehicleType: nullable(item.vehicleType),
      containerNumber: nullable(item.containerNumber),
      trailerNumber: nullable(item.trailerNumber),
      driverName: nullable(item.driverName),
      fee01: nullable(item.fee01),
      transferPlace: nullable(item.transferPlace),
      note: nullable(item.note),
    })),
    appointment: declaration.appointment
      ? {
          id: nullable(declaration.appointment.id),
          scheduledAt: declaration.appointment.scheduledAt,
          gateCode: nullable(declaration.appointment.gateCode),
          laneCode: nullable(declaration.appointment.laneCode),
          status: declaration.appointment.status,
        }
      : null,
    attachments,
    feeDeclarationCode: nullable(declaration.feeDeclarationCode),
    workflowProgress: sanitizeWorkflowProgress(declaration.workflowProgress),
    auditTrail: declaration.auditTrail,
    workflowSteps,
    workflowHistory,
    feeStepReached,
    qrCode: declaration.qrCode,
    entryAt: passage.entryAt,
    exitAt: passage.exitAt,
  };
}
