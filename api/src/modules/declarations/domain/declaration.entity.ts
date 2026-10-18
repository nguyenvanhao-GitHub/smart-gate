import { randomUUID } from 'crypto';
import {
  AppointmentStatus,
  CheckpointCode,
  DeclarationAction,
  DeclarationStatus,
  DeclarationType,
  ForceStatus,
  WorkflowStepCode,
} from './declaration.enums';
import { buildDossierQrPayload } from './dossier-qr';

/** Bước "đã khai báo" tương ứng luồng xuất/nhập — mốc mở phiên xử lý liên ngành khi gửi hồ sơ. */
function declaredStepFor(type: DeclarationType): WorkflowStepCode {
  return type === DeclarationType.EXPORT || type === DeclarationType.TRANSSHIPMENT_EXPORT
    ? WorkflowStepCode.EXPORT_DECLARED
    : WorkflowStepCode.IMPORT_DECLARED;
}

export interface VehicleInfo {
  /** Khoá của bảng `vehicles`. Trống khi hồ sơ chưa được lưu lần nào. */
  id?: string;
  plateNumber: string;
  containerNumber?: string;
  trailerNumber?: string;
  transportLicenseNumber?: string;
  /** Mã trong danh mục `VEHICLE_TYPE`. */
  vehicleType?: string;
  weightKg?: number;
  /** Tài xế điều khiển chính xe này (BUG-033) — mỗi phương tiện gắn một lái xe. */
  driver?: DriverInfo | null;
}

export interface EnterpriseInfo {
  /** Khoá của bảng `enterprises`. Mã số thuế mới là khoá tự nhiên. */
  id?: string;
  taxCode?: string;
  name?: string;
  representativeName?: string;
  address?: string;
  phone?: string;
  email?: string;
  username?: string;
  /** Số CCCD/Hộ chiếu đối với tài khoản cá nhân khai báo. */
  idNumber?: string;
  /** Loại tài khoản khai báo: ENTERPRISE | INDIVIDUAL | INTERNAL */
  accountType?: string;
  jobTitle?: string;
  department?: string;
  createForOther?: boolean;
}

/**
 * Hàng hoá dạng **một khối** — contract cũ của domain. Cột `declarations.cargo` (jsonb) đã bị gỡ
 * (rủi ro R2); khối này nay được mapper dựng lại từ bảng `cargo_items`. Nguồn chính là `cargoItems`.
 */
export interface CargoInfo {
  description: string;
  quantity?: number;
  grossWeightKg?: number;
}

/** Một dòng hàng của hồ sơ — bảng `cargo_items`. */
export interface CargoItemInfo {
  id?: string;
  description: string;
  /** Mã trong danh mục `CARGO_TYPE`. */
  cargoTypeCode?: string;
  quantity?: number;
  /** Mã trong danh mục `UNIT`. */
  unitCode?: string;
  grossWeightKg?: number;
}

/**
 * Phương tiện **nhận sang tải** (bảng `transshipment_vehicles`) — chỉ có ở hồ sơ loại Sang tải
 * (TRANSSHIPMENT), CR9/CR18/CR33. Lái xe ở đây theo mockup chỉ là **tên** (#S1).
 */
export interface TransshipmentVehicleInfo {
  id?: string;
  /** Biển số xe chở hàng gốc (chọn từ phương tiện của hồ sơ). */
  sourcePlate?: string;
  plateNumber: string;
  /** Mã trong danh mục `VEHICLE_TYPE`. */
  vehicleType?: string;
  containerNumber?: string;
  trailerNumber?: string;
  /** Tên lái xe nhận sang tải (chỉ tên). */
  driverName?: string;
  /** Phí 01 — giữ nguyên chuỗi người dùng nhập. */
  fee01?: string;
  transferPlace?: string;
  note?: string;
}

/** Tài xế điều khiển phương tiện — nay nhúng theo **từng xe** vào bảng `vehicles` (BUG-033). */
export interface DriverInfo {
  id?: string;
  fullName: string;
  idNumber: string;
  /** CCCD / hộ chiếu / giấy thông hành. */
  idType?: string;
  phone?: string;
  licenseNumber?: string;
  nationality?: string;
}

/** Lịch hẹn qua cửa khẩu — bảng `appointments`. */
export interface AppointmentInfo {
  id?: string;
  scheduledAt: Date;
  gateCode?: string;
  laneCode?: string;
  status: AppointmentStatus;
}

/**
 * Các thành phần đã tách khỏi cột `jsonb` sang bảng quan hệ ở P2. Gom thành một tham số dạng
 * đối tượng để không kéo dài thêm danh sách tham số vị trí vốn đã dài của `Declaration`.
 */
export interface DossierParts {
  enterpriseId?: string | null;
  /** Phương tiện vận chuyển — **một xe/hồ sơ** (CR8). Giữ kiểu mảng để tương thích contract, khóa max 1. */
  vehicles?: VehicleInfo[];
  cargoItems?: CargoItemInfo[];
  /** Phương tiện nhận sang tải — chỉ dùng cho hồ sơ loại Sang tải (CR9/CR18/CR33). */
  transshipmentVehicles?: TransshipmentVehicleInfo[];
  appointment?: AppointmentInfo | null;
  submittedAt?: Date | null;
  qrCode?: string | null;
  /** CR2 — cờ ưu tiên kiểm dịch (dịch tễ). Xem `Declaration.epidemicFlag`. */
  epidemicFlag?: boolean;
  epidemicMarkedBy?: string | null;
  epidemicMarkedAt?: Date | null;
}

export type WorkflowProgress = Partial<Record<WorkflowStepCode, ForceStatus>>;

export interface AuditEntry {
  id: string;
  at: Date;
  actorId: string;
  actorRole: string;
  action: DeclarationAction;
  note?: string;
  fromStatus?: DeclarationStatus;
  toStatus?: DeclarationStatus;
}

export class Declaration {
  /** Khoá bảng `enterprises`. Nhiều hồ sơ dùng chung một doanh nghiệp. */
  enterpriseId: string | null;
  /** Phương tiện vận chuyển của hồ sơ — **một xe/hồ sơ** (CR8). `vehicle` đồng bộ với xe này. */
  vehicles: VehicleInfo[];
  /** Các dòng hàng — nguồn chính thức thay cho cột `cargo` dạng jsonb. */
  cargoItems: CargoItemInfo[];
  /** Phương tiện nhận sang tải — chỉ có ở hồ sơ loại Sang tải (CR9/CR18/CR33). */
  transshipmentVehicles: TransshipmentVehicleInfo[];
  appointment: AppointmentInfo | null;
  /** Thời điểm doanh nghiệp gửi hồ sơ. Null khi còn là nháp. */
  submittedAt: Date | null;
  /** Chuỗi mã QR sinh khi gửi hồ sơ (F14). */
  qrCode: string | null;
  /**
   * CR2 — **cờ ưu tiên kiểm dịch (dịch tễ)**. Bật một chiều bởi cán bộ Biên phòng khi cho xe qua
   * cổng vào (nút "Ưu tiên kiểm dịch"); KHÔNG có đường gỡ. Khi bật, trong cụm nghiệp vụ thì Kiểm dịch
   * là bước tiên quyết — Biên phòng và Hải quan bị chặn tới khi Kiểm dịch hoàn thành.
   */
  epidemicFlag: boolean;
  epidemicMarkedBy: string | null;
  epidemicMarkedAt: Date | null;

  constructor(
    public readonly id: string,
    public code: string,
    public type: DeclarationType,
    public status: DeclarationStatus,
    public enterprise: EnterpriseInfo,
    public vehicle: VehicleInfo,
    public cargo: CargoInfo,
    public checkpoint: CheckpointCode,
    public workflowProgress: WorkflowProgress,
    public auditTrail: AuditEntry[],
    public createdAt: Date,
    public updatedAt: Date,
    public feeDeclarationCode?: string,
    /** Tài khoản đã tạo hồ sơ. Với tài khoản không gắn doanh nghiệp thì đây là căn cứ phạm vi `OWN`. */
    public createdById?: string,
    parts: DossierParts = {},
  ) {
    this.enterpriseId = parts.enterpriseId ?? enterprise?.id ?? null;
    this.appointment = parts.appointment ?? null;
    this.submittedAt = parts.submittedAt ?? null;
    this.qrCode = parts.qrCode ?? null;
    this.epidemicFlag = parts.epidemicFlag ?? false;
    this.epidemicMarkedBy = parts.epidemicMarkedBy ?? null;
    this.epidemicMarkedAt = parts.epidemicMarkedAt ?? null;
    // Không truyền sẵn danh sách phương tiện (một số test/fixture chỉ dựng phương tiện đơn) thì suy
    // một xe từ khối đó. Repository luôn nạp `vehicles` từ bảng `vehicles` nên nhánh này chỉ còn phục
    // vụ dựng hồ sơ trong bộ nhớ. `vehicle` giữ đồng bộ với xe đó để mọi nơi đọc cũ vẫn chạy.
    // Đọc từ DB **không** khóa max-1: hồ sơ lịch sử nhiều xe vẫn hiện đủ; ràng buộc một-xe áp khi
    // ghi qua `setVehicles` (CR8). Constructor giữ nguyên danh sách được truyền vào.
    this.vehicles = parts.vehicles?.length ? parts.vehicles : Declaration.vehiclesFromLegacy(vehicle);
    this.vehicle = this.vehicles[0] ?? vehicle;
    this.transshipmentVehicles = parts.transshipmentVehicles ?? [];
    // Không truyền sẵn dòng hàng (một số test/fixture chỉ dựng khối `cargo`) thì suy một dòng từ
    // khối đó. Repository luôn nạp `cargoItems` từ bảng `cargo_items` nên nhánh này chỉ còn phục vụ
    // dựng hồ sơ trong bộ nhớ, không còn liên quan cột jsonb đã gỡ.
    this.cargoItems = parts.cargoItems?.length ? parts.cargoItems : Declaration.cargoItemsFromLegacy(this.cargo);
  }

  private static vehiclesFromLegacy(vehicle?: VehicleInfo | null): VehicleInfo[] {
    return vehicle?.plateNumber?.trim() ? [vehicle] : [];
  }

  private static cargoItemsFromLegacy(cargo?: CargoInfo | null): CargoItemInfo[] {
    if (!cargo?.description) return [];
    return [
      {
        description: cargo.description,
        quantity: cargo.quantity,
        grossWeightKg: cargo.grossWeightKg,
      },
    ];
  }

  /** Khoá trường theo trạng thái (F15): chỉ hồ sơ nháp hoặc bị yêu cầu bổ sung mới được sửa. */
  get isEditable(): boolean {
    return this.status === DeclarationStatus.DRAFT || this.status === DeclarationStatus.REVISION_REQUIRED;
  }

  /** Biển số của mọi phương tiện trong hồ sơ (đã bỏ trống), phục vụ chống trùng biển theo từng xe (F09). */
  get plateNumbers(): string[] {
    return this.vehicles.map((item) => item.plateNumber?.trim()).filter((plate): plate is string => !!plate);
  }

  /**
   * Tài xế đại diện của hồ sơ = tài xế của **xe đầu tiên có khai** (BUG-033). Nguồn thật là lái xe
   * theo từng phương tiện (`vehicles[i].driver`); getter này chỉ để danh sách/cổng/liên ngành đọc
   * nhanh một người điều khiển tiêu biểu mà không phải tự dò danh sách xe.
   */
  get driver(): DriverInfo | null {
    return this.vehicles.find((vehicle) => vehicle.driver)?.driver ?? null;
  }

  /**
   * Thay phương tiện vận chuyển. **Một xe/hồ sơ** (CR8): chỉ giữ phần tử đầu, bỏ qua các xe thừa —
   * biểu mẫu web nay chỉ gửi một xe, đây là chốt chặn cuối để dữ liệu ghi xuống luôn ≤ 1 xe. Đồng bộ
   * `vehicle` (cột denormalized `declarations.plateNumber`) theo xe đó.
   */
  setVehicles(items: VehicleInfo[]): void {
    this.vehicles = items.slice(0, 1);
    this.vehicle = this.vehicles[0] ?? { plateNumber: '' };
    this.updatedAt = new Date();
  }

  /** Thay toàn bộ danh sách phương tiện nhận sang tải (CR9). Giống `setCargoItems` cho dòng hàng. */
  setTransshipmentVehicles(items: TransshipmentVehicleInfo[]): void {
    this.transshipmentVehicles = items;
    this.updatedAt = new Date();
  }

  /** Thay toàn bộ dòng hàng, đồng thời đồng bộ lại cột `cargo` cũ để phân hệ khác chưa đổi vẫn chạy. */
  setCargoItems(items: CargoItemInfo[]): void {
    this.cargoItems = items;
    const first = items[0];
    this.cargo = first
      ? {
          description: first.description,
          quantity: first.quantity,
          grossWeightKg: first.grossWeightKg,
        }
      : { description: '' };
    this.updatedAt = new Date();
  }

  /**
   * Gửi hồ sơ (F13/F14). Việc kiểm tra tính đầy đủ nằm ở `dossier-completeness.rules.ts` và phải
   * chạy **trước** khi gọi hàm này — use-case chịu trách nhiệm chặn, entity chỉ ghi nhận.
   */
  submit(actorId: string, actorRole: string, at: Date = new Date()): void {
    const fromStatus = this.status;
    this.status = DeclarationStatus.WAITING_GATE;
    this.submittedAt = at;
    this.qrCode = buildDossierQrPayload(this.code, at);
    // Đánh dấu bước "đã khai báo" hoàn thành để phiên xử lý liên ngành khởi động từ đúng mốc.
    this.workflowProgress = { ...this.workflowProgress, [declaredStepFor(this.type)]: ForceStatus.COMPLETED };
    this.updatedAt = at;
    const isResubmit = fromStatus === DeclarationStatus.REVISION_REQUIRED;
    this.auditTrail.push({
      id: randomUUID(),
      at,
      actorId,
      actorRole,
      action: isResubmit ? DeclarationAction.RESUBMIT : DeclarationAction.SUBMIT,
      note: isResubmit ? 'Doanh nghiệp bổ sung hồ sơ.' : 'Doanh nghiệp gửi hồ sơ lên hệ thống.',
      fromStatus,
      toStatus: this.status,
    });
  }

  requestRevision(actorId: string, actorRole: string, note: string): void {
    const fromStatus = this.status;
    this.status = DeclarationStatus.REVISION_REQUIRED;
    this.updatedAt = new Date();
    this.auditTrail.push({
      id: randomUUID(),
      at: this.updatedAt,
      actorId,
      actorRole,
      action: DeclarationAction.REQUEST_REVISION,
      note,
      fromStatus,
      toStatus: this.status,
    });
  }

  cancel(actorId: string, actorRole: string, note?: string): void {
    const fromStatus = this.status;
    this.status = DeclarationStatus.CANCELLED;
    this.updatedAt = new Date();
    this.auditTrail.push({
      id: randomUUID(),
      at: this.updatedAt,
      actorId,
      actorRole,
      action: DeclarationAction.CANCEL,
      note,
      fromStatus,
      toStatus: this.status,
    });
  }

  recordOperationAction(actorId: string, actorRole: string, note?: string): void {
    this.updatedAt = new Date();
    this.auditTrail.push({
      id: randomUUID(),
      at: this.updatedAt,
      actorId,
      actorRole,
      action: DeclarationAction.OPERATION_ACTION,
      note,
      fromStatus: this.status,
      toStatus: this.status,
    });
  }

  markWorkflowStepCompleted(step: WorkflowStepCode, actorId: string, actorRole: string, note?: string): void {
    this.workflowProgress[step] = ForceStatus.COMPLETED;
    this.recordOperationAction(actorId, actorRole, note || `${step} completed`);
  }

  recordFeeMerge(actorId: string, actorRole: string, note?: string): void {
    this.updatedAt = new Date();
    this.auditTrail.push({
      id: randomUUID(),
      at: this.updatedAt,
      actorId,
      actorRole,
      action: DeclarationAction.FEE_MERGE,
      note,
      fromStatus: this.status,
      toStatus: this.status,
    });
  }

  /**
   * Đặt trạng thái hồ sơ theo phiên xử lý liên ngành (P3). Trạng thái do
   * `workflow/domain/workflow-status.rules.ts` tính từ bước hiện tại, entity chỉ ghi nhận —
   * không tự suy diễn để tránh hai nơi cùng quyết định một thứ.
   */
  applyWorkflowStatus(status: DeclarationStatus): void {
    this.status = status;
    this.updatedAt = new Date();
  }

  setCheckpoint(checkpoint: CheckpointCode): void {
    this.checkpoint = checkpoint;
    this.updatedAt = new Date();
  }

  /**
   * CR2 — bật **cờ ưu tiên kiểm dịch** (dịch tễ). Một chiều: đã bật thì giữ nguyên, không có đường
   * gỡ. Ghi người/mốc đánh dấu lần đầu để lưu vết. Trả `true` nếu vừa bật (để nơi gọi biết có thay đổi).
   */
  markQuarantinePriority(actorId: string, at: Date = new Date()): boolean {
    if (this.epidemicFlag) return false;
    this.epidemicFlag = true;
    this.epidemicMarkedBy = actorId;
    this.epidemicMarkedAt = at;
    this.updatedAt = at;
    return true;
  }

  /**
   * F44 — **cổng ra cho xe qua**: hồ sơ đã rời cửa khẩu (`EXITED`) rồi được lưu trữ ngay (`COMPLETED`),
   * tự động theo MVP. Đây là **đường duy nhất** đặt hồ sơ sang `EXITED` — không còn qua
   * `POST /workflow/.../decide`. Ghi hai mốc trạng thái vào nhật ký để truy vết đủ bước.
   */
  markExitedThenCompleted(actorId: string, actorRole: string, note: string, at: Date = new Date()): void {
    const fromStatus = this.status;
    this.status = DeclarationStatus.EXITED;
    this.auditTrail.push({
      id: randomUUID(),
      at,
      actorId,
      actorRole,
      action: DeclarationAction.OPERATION_ACTION,
      note,
      fromStatus,
      toStatus: DeclarationStatus.EXITED,
    });
    this.status = DeclarationStatus.COMPLETED;
    this.auditTrail.push({
      id: randomUUID(),
      at,
      actorId,
      actorRole,
      action: DeclarationAction.COMPLETE,
      note,
      fromStatus: DeclarationStatus.EXITED,
      toStatus: DeclarationStatus.COMPLETED,
    });
    this.updatedAt = at;
  }
}
