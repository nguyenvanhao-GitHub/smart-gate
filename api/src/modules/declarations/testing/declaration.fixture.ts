import {
  AppointmentInfo,
  CargoInfo,
  CargoItemInfo,
  Declaration,
  DriverInfo,
  EnterpriseInfo,
  VehicleInfo,
  WorkflowProgress,
  AuditEntry,
} from '../domain/declaration.entity';
import {
  AppointmentStatus,
  CheckpointCode,
  DeclarationStatus,
  DeclarationType,
} from '../domain/declaration.enums';
import { PaginatedResult } from '../../../common/http/pagination';
import { UserAccessContext } from '../../../common/auth/access-context';
import { DataScopeLevel } from '../../access-control/domain/data-scope.enum';
import {
  DeclarationPageCriteria,
  DeclarationRepository,
  DeclarationSearchCriteria,
} from '../application/ports/declaration.repository';
import {
  DossierAttachmentPort,
  DossierAttachmentView,
} from '../application/ports/dossier-attachment.port';
import { RequiredDocumentCatalogPort } from '../application/ports/required-document.port';
import { RequiredDocumentType } from '../domain/dossier-completeness.rules';

/**
 * Bộ dữ liệu dựng sẵn cho test — KHÔNG dùng trong mã sản phẩm.
 */
export interface DeclarationOverrides {
  id?: string;
  code?: string;
  type?: DeclarationType;
  status?: DeclarationStatus;
  enterprise?: EnterpriseInfo;
  /** Phương tiện đơn (xe đầu). Bỏ trống `vehicles` thì hồ sơ có đúng xe này. */
  vehicle?: VehicleInfo;
  /** Danh sách phương tiện — dùng khi cần dựng hồ sơ nhiều xe. */
  vehicles?: VehicleInfo[];
  cargo?: CargoInfo;
  checkpoint?: CheckpointCode;
  workflowProgress?: WorkflowProgress;
  auditTrail?: AuditEntry[];
  createdAt?: Date;
  updatedAt?: Date;
  feeDeclarationCode?: string;
  createdById?: string;
  /** Các phần đã tách bảng ở P2. Bỏ trống `cargoItems` thì entity tự suy từ khối `cargo` truyền vào. */
  driver?: DriverInfo | null;
  cargoItems?: CargoItemInfo[];
  appointment?: AppointmentInfo | null;
  submittedAt?: Date | null;
  qrCode?: string | null;
  epidemicFlag?: boolean;
}

export function makeDeclaration(overrides: DeclarationOverrides = {}): Declaration {
  const now = new Date('2026-07-22T08:00:00.000Z');
  // `vehicles` (nếu truyền) là nguồn chính; positional `vehicle` chỉ là xe đầu tóm tắt. Lấy xe đầu
  // từ danh sách để truyền `vehicles: []` cho ra hồ sơ **không có** phương tiện đúng như mong đợi.
  const baseVehicles = overrides.vehicles ?? [overrides.vehicle ?? { plateNumber: '26C-123.45' }];
  // Lái xe nhúng theo từng xe (BUG-033): tiện lợi cho test cũ, `overrides.driver` được gán cho mọi
  // phương tiện chưa có lái xe riêng, để `declaration.driver` (getter) và kiểm đầy đủ theo xe chạy đúng.
  const vehicles = overrides.driver
    ? baseVehicles.map((item) => ({ ...item, driver: item.driver ?? overrides.driver ?? null }))
    : baseVehicles;
  const vehicle = vehicles[0] ?? { plateNumber: '' };
  return new Declaration(
    overrides.id ?? 'decl-001',
    overrides.code ?? 'CK-2026-0001',
    overrides.type ?? DeclarationType.IMPORT,
    overrides.status ?? DeclarationStatus.SUBMITTED,
    { taxCode: '5500123456', name: 'Công ty TNHH Chiềng Khương', phone: '0900000000', ...overrides.enterprise },
    vehicle,
    overrides.cargo ?? { description: 'Nông sản tổng hợp' },
    overrides.checkpoint ?? CheckpointCode.B1,
    overrides.workflowProgress ?? {},
    overrides.auditTrail ?? [],
    overrides.createdAt ?? now,
    overrides.updatedAt ?? now,
    overrides.feeDeclarationCode,
    overrides.createdById,
    {
      vehicles,
      cargoItems: overrides.cargoItems,
      appointment: overrides.appointment ?? null,
      submittedAt: overrides.submittedAt ?? null,
      qrCode: overrides.qrCode ?? null,
      epidemicFlag: overrides.epidemicFlag,
    },
  );
}

/** Quyền hiệu lực giả lập. Mặc định: tài khoản doanh nghiệp phạm vi `OWN`, chưa gắn mã số thuế nào. */
export function makeAccess(overrides: Partial<UserAccessContext> = {}): UserAccessContext {
  return {
    userId: overrides.userId ?? 'user-dn-a',
    roles: overrides.roles ?? [{ code: 'DN', name: 'Doanh nghiệp', dataScope: DataScopeLevel.OWN }],
    permissions: overrides.permissions ?? ['dossier.view', 'dossier.create', 'dossier.update'],
    assignments: overrides.assignments ?? [],
  };
}

/** Repository hồ sơ trong bộ nhớ — không đụng PostgreSQL. */
export class InMemoryDeclarationRepository implements DeclarationRepository {
  readonly rows = new Map<string, Declaration>();

  constructor(seed: Declaration[] = []) {
    seed.forEach((item) => this.rows.set(item.id, item));
  }

  async nextCode(type?: DeclarationType): Promise<string> {
    const prefix = type ? type.slice(0, 3).toUpperCase() : 'CK';
    return `${prefix}-2026-${String(this.rows.size + 1).padStart(4, '0')}`;
  }

  async findMany(criteria?: DeclarationSearchCriteria): Promise<Declaration[]> {
    let items = [...this.rows.values()];
    if (criteria?.code?.trim()) {
      const c = criteria.code.trim().toLowerCase();
      items = items.filter((item) => item.code.toLowerCase().includes(c) || item.id.toLowerCase().includes(c));
    }
    if (criteria?.keyword?.trim()) {
      const kw = criteria.keyword.trim().toLowerCase();
      items = items.filter(
        (item) =>
          item.code.toLowerCase().includes(kw) ||
          item.id.toLowerCase().includes(kw) ||
          (item.feeDeclarationCode && item.feeDeclarationCode.toLowerCase().includes(kw)) ||
          item.vehicles.some((v) => v.plateNumber?.toLowerCase().includes(kw)) ||
          (item.enterprise?.name && item.enterprise.name.toLowerCase().includes(kw)) ||
          (item.enterprise?.taxCode && item.enterprise.taxCode.toLowerCase().includes(kw)),
      );
    }
    const scope = criteria?.scope;
    if (scope && !scope.unrestricted) {
      const taxCodes = scope.taxCodes ?? [];
      if (taxCodes.length > 0) {
        items = items.filter((item) => item.enterprise?.taxCode && taxCodes.includes(item.enterprise.taxCode));
      } else if (scope.ownerUserId) {
        items = items.filter((item) => item.createdById === scope.ownerUserId);
      }
    }
    return items;
  }

  async findPage(_criteria: DeclarationPageCriteria): Promise<PaginatedResult<Declaration>> {
    const items = [...this.rows.values()];
    return { items, total: items.length, page: 1, pageSize: items.length };
  }

  async count(criteria: DeclarationSearchCriteria): Promise<number> {
    return (await this.findMany(criteria)).length;
  }

  async findById(id: string): Promise<Declaration | null> {
    return this.rows.get(id) ?? null;
  }

  async findByCode(code: string): Promise<Declaration | null> {
    return [...this.rows.values()].find((item) => item.code === code) ?? null;
  }

  async save(declaration: Declaration): Promise<Declaration> {
    // CR8 — cho phép trùng biển số giữa các hồ sơ (bỏ F09): không còn kiểm biển ở tầng ghi.
    this.rows.set(declaration.id, declaration);
    return declaration;
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  async findActiveConflicts(
    vehicles: { plateNumber?: string; driverIdNumber?: string }[],
    excludeDossierId?: string,
  ) {
    const finishedStatuses = [
      DeclarationStatus.COMPLETED,
      DeclarationStatus.REJECTED,
      DeclarationStatus.CANCELLED,
    ];
    const conflicts: import('../application/ports/declaration.repository').ActiveDossierConflict[] = [];
    for (const d of this.rows.values()) {
      if (excludeDossierId && d.id === excludeDossierId) continue;
      if (finishedStatuses.includes(d.status)) continue;
      for (const rowVehicle of d.vehicles) {
        vehicles.forEach((v, index) => {
          if (
            v.plateNumber &&
            rowVehicle.plateNumber &&
            v.plateNumber.trim().toLowerCase() === rowVehicle.plateNumber.trim().toLowerCase()
          ) {
            conflicts.push({
              field: 'plateNumber',
              value: v.plateNumber,
              vehicleIndex: index,
              dossierId: d.id,
              dossierCode: d.code,
            });
          }
          if (
            v.driverIdNumber &&
            rowVehicle.driver?.idNumber &&
            v.driverIdNumber.trim() === rowVehicle.driver.idNumber.trim()
          ) {
            conflicts.push({
              field: 'driverIdNumber',
              value: v.driverIdNumber,
              vehicleIndex: index,
              dossierId: d.id,
              dossierCode: d.code,
            });
          }
        });
      }
    }
    return conflicts;
  }
}

/** Chứng từ của hồ sơ, giả lập trong bộ nhớ. Mặc định có 1 tệp chứng từ để hồ sơ nháp đủ điều kiện gửi. */
export class FakeDossierAttachments implements DossierAttachmentPort {
  constructor(
    private readonly rows: DossierAttachmentView[] = [
      {
        id: 'att-01',
        fileName: 'tokhai.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
        documentTypeCode: 'CUSTOMS_DECLARATION',
        documentTypeName: 'Tờ khai hải quan',
        uploadedAt: new Date(),
        uploadedBy: 'user-01',
      },
    ],
  ) {}

  async listByDossier(): Promise<DossierAttachmentView[]> {
    return this.rows;
  }

  async attach(): Promise<DossierAttachmentView[]> {
    return this.rows;
  }

  async detach(): Promise<void> {
    // Không cần hành vi thật cho test hiện có.
  }

  async cloneToDossier(): Promise<DossierAttachmentView[]> {
    return this.rows;
  }
}

/** Danh mục chứng từ bắt buộc. Mặc định **rỗng** — đúng trạng thái chờ chốt điểm D7. */
export class FakeRequiredDocumentCatalog implements RequiredDocumentCatalogPort {
  constructor(private readonly required: RequiredDocumentType[] = []) {}

  async listForDossierType(): Promise<RequiredDocumentType[]> {
    return this.required;
  }
}

/** Hồ sơ nháp đã khai đủ mọi thứ — dùng làm điểm xuất phát cho test "thiếu đúng một trường". */
export function makeCompleteDraft(overrides: DeclarationOverrides = {}): Declaration {
  return makeDeclaration({
    status: DeclarationStatus.DRAFT,
    enterprise: { taxCode: '5500123456', name: 'Công ty TNHH Chiềng Khương' },
    vehicle: { plateNumber: '26C-123.45', vehicleType: 'TRUCK' },
    driver: { fullName: 'Nguyễn Văn A', idNumber: '001199001234', licenseNumber: 'GPLX-123456', nationality: 'VN' },
    cargoItems: [{ description: 'Nông sản tổng hợp', quantity: 10, unitCode: 'TON' }],
    appointment: { scheduledAt: new Date('2026-12-01T08:00:00Z'), status: AppointmentStatus.SCHEDULED },
    ...overrides,
  });
}
