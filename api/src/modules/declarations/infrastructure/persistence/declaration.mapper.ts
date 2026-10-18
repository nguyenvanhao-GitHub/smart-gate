import { randomUUID } from 'crypto';
import {
  AppointmentInfo,
  CargoInfo,
  CargoItemInfo,
  Declaration,
  DriverInfo,
  EnterpriseInfo,
  TransshipmentVehicleInfo,
  VehicleInfo,
} from '../../domain/declaration.entity';
import { AppointmentStatus } from '../../domain/declaration.enums';
import { AppointmentOrmEntity } from './appointment.orm-entity';
import { CargoItemOrmEntity } from './cargo-item.orm-entity';
import { DeclarationOrmEntity } from './declaration.orm-entity';
import { DriverOrmEntity } from './driver.orm-entity';
import { EnterpriseOrmEntity } from './enterprise.orm-entity';
import { TransshipmentVehicleOrmEntity } from './transshipment-vehicle.orm-entity';
import { VehicleOrmEntity } from './vehicle.orm-entity';

/** Các bản ghi con của một hồ sơ, đọc từ bảng quan hệ đã tách ở P2. */
export interface DossierRelationalRows {
  enterprise?: EnterpriseOrmEntity | null;
  vehicles?: VehicleOrmEntity[];
  driver?: DriverOrmEntity | null;
  cargoItems?: CargoItemOrmEntity[];
  transshipmentVehicles?: TransshipmentVehicleOrmEntity[];
  appointment?: AppointmentOrmEntity | null;
}

/** PostgreSQL trả `numeric` về dạng chuỗi để không mất độ chính xác — đổi lại thành số cho domain. */
function toNumber(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toNumericColumn(value: number | undefined | null): string | null {
  return value === undefined || value === null ? null : String(value);
}

function orUndefined<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

export class DeclarationMapper {
  /**
   * Dựng hồ sơ từ bảng chính + các bảng con. Nguồn dữ liệu con là **bảng quan hệ** (P2); ba cột
   * `jsonb` cũ (`enterprise`/`vehicle`/`cargo`) đã bị gỡ ở migration R2. Hồ sơ cũ thiếu bảng con
   * (chưa di trú) được dựng lại an toàn từ các cột scalar còn lưu trên bảng chính.
   */
  static toDomain(row: DeclarationOrmEntity, related: DossierRelationalRows = {}): Declaration {
    const declarant = row.declarantAccount || row.workflowProgress || {};
    const ent = related.enterprise;

    const identifier = ent?.taxCode || row.enterpriseTaxCode || '';
    const isInternal =
      row.enterpriseTaxCode === 'INTERNAL' ||
      identifier.includes('@') ||
      declarant.accountType === 'INTERNAL' ||
      Boolean(typeof declarant.email === 'string' && declarant.email.includes('@'));

    const inferredAccountType =
      (declarant.accountType as string) ||
      (isInternal
        ? 'INTERNAL'
        : (declarant.idNumber ? 'INDIVIDUAL' : (identifier ? 'ENTERPRISE' : undefined)));

    const email = (declarant.email as string) || (identifier.includes('@') ? identifier : undefined);
    const idNumber =
      (declarant.idNumber as string) ||
      (inferredAccountType === 'INDIVIDUAL' && row.enterpriseTaxCode !== 'INTERNAL'
        ? (ent?.taxCode || (row.enterpriseTaxCode ? row.enterpriseTaxCode : undefined))
        : undefined);
    const jobTitle = (declarant.jobTitle as string) || undefined;
    const department = (declarant.department as string) || undefined;
    const createForOther = declarant.createForOther !== undefined ? Boolean(declarant.createForOther) : undefined;

    const enterprise: EnterpriseInfo = ent
      ? {
          id: ent.id,
          taxCode: ent.taxCode,
          name: ent.name,
          representativeName: orUndefined(ent.representativeName),
          address: orUndefined(ent.address),
          phone: orUndefined(ent.phone),
          accountType: inferredAccountType,
          idNumber,
          email,
          jobTitle,
          department,
          createForOther,
        }
      : {
          id: row.enterpriseId ?? undefined,
          taxCode: inferredAccountType === 'ENTERPRISE' && row.enterpriseTaxCode !== 'INTERNAL' ? row.enterpriseTaxCode : '',
          name: (declarant.name as string) || '',
          representativeName: orUndefined(declarant.representativeName as string),
          address: orUndefined(declarant.address as string),
          phone: orUndefined(declarant.phone as string),
          accountType: inferredAccountType,
          idNumber,
          email,
          jobTitle,
          department,
          createForOther,
        };

    // Lái xe cũ (một hồ sơ một bản ghi) chỉ còn dùng làm phương án dự phòng cho hồ sơ **chưa di trú**:
    // gán cho xe đầu khi xe đó chưa có lái xe nhúng. Hồ sơ mới ghi lái xe thẳng vào từng dòng `vehicles`.
    const legacyDriver: DriverInfo | null = related.driver
      ? {
          id: related.driver.id,
          fullName: related.driver.fullName,
          idNumber: related.driver.idNumber,
          idType: orUndefined(related.driver.idType),
          phone: orUndefined(related.driver.phone),
          licenseNumber: orUndefined(related.driver.licenseNumber),
          nationality: orUndefined(related.driver.nationality),
        }
      : null;

    // Một phương tiện/hồ sơ (CR8) — giữ kiểu mảng cho contract, khóa duy nhất ở DB. Lái xe nhúng theo
    // xe (BUG-033). Hồ sơ cũ thiếu bảng con thì dựng một xe từ cột scalar denormalized còn lưu trên
    // bảng chính (không đọc jsonb đã gỡ).
    const vehicles: VehicleInfo[] = (related.vehicles ?? []).map((item) => ({
      id: item.id,
      plateNumber: item.plateNumber,
      containerNumber: orUndefined(item.containerNumber),
      trailerNumber: orUndefined(item.trailerNumber),
      transportLicenseNumber: orUndefined(item.transportLicenseNumber),
      vehicleType: orUndefined(item.vehicleType),
      weightKg: toNumber(item.weightKg),
      driver: DeclarationMapper.vehicleDriver(item) ?? legacyDriver,
    }));
    if (vehicles.length === 0 && (row.plateNumber || row.containerNumber || row.trailerNumber)) {
      vehicles.push({
        plateNumber: row.plateNumber,
        containerNumber: orUndefined(row.containerNumber),
        trailerNumber: orUndefined(row.trailerNumber),
        driver: legacyDriver,
      });
    }
    // `vehicle` (xe đầu) giữ đồng bộ để mọi nơi đọc cũ vẫn chạy; rỗng thì trả xe trống an toàn.
    const vehicle: VehicleInfo = vehicles[0] ?? { plateNumber: row.plateNumber ?? '' };

    const cargoItems: CargoItemInfo[] = (related.cargoItems ?? [])
      .slice()
      .sort((left, right) => left.lineNo - right.lineNo)
      .map((item) => ({
        id: item.id,
        description: item.description,
        cargoTypeCode: orUndefined(item.cargoTypeCode),
        quantity: toNumber(item.quantity),
        unitCode: orUndefined(item.unitCode),
        grossWeightKg: toNumber(item.grossWeightKg),
      }));

    // Khối `cargo` một-dòng (contract cũ của domain) nay được dựng lại từ chính các dòng hàng của
    // bảng `cargo_items` thay vì đọc cột `jsonb` đã gỡ — giữ đúng cách domain đồng bộ ở `setCargoItems`.
    const cargo: CargoInfo = DeclarationMapper.cargoFromItems(cargoItems);

    // Phương tiện nhận sang tải (CR9) — chỉ có ở hồ sơ Sang tải; sắp theo `line_no`.
    const transshipmentVehicles: TransshipmentVehicleInfo[] = (related.transshipmentVehicles ?? [])
      .slice()
      .sort((left, right) => left.lineNo - right.lineNo)
      .map((item) => ({
        id: item.id,
        sourcePlate: orUndefined(item.sourcePlate),
        plateNumber: item.plateNumber,
        vehicleType: orUndefined(item.vehicleType),
        containerNumber: orUndefined(item.containerNumber),
        trailerNumber: orUndefined(item.trailerNumber),
        driverName: orUndefined(item.driverName),
        fee01: orUndefined(item.fee01),
        transferPlace: orUndefined(item.transferPlace),
        note: orUndefined(item.note),
      }));

    const appointment: AppointmentInfo | null = related.appointment
      ? {
          id: related.appointment.id,
          scheduledAt: related.appointment.scheduledAt,
          gateCode: orUndefined(related.appointment.gateCode),
          laneCode: orUndefined(related.appointment.laneCode),
          status: related.appointment.status,
        }
      : null;

    const rawProgress = row.workflowProgress || {};
    const cleanProgress: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawProgress)) {
      if (!['accountType', 'idNumber', 'email', 'name', 'phone', 'address', 'representativeName', 'jobTitle', 'department', 'createForOther'].includes(k)) {
        cleanProgress[k] = v;
      }
    }

    return new Declaration(
      row.id,
      row.code,
      row.type,
      row.status,
      enterprise,
      vehicle,
      cargo,
      row.checkpoint,
      cleanProgress,
      (row.auditTrail || []) as never,
      row.createdAt,
      row.updatedAt,
      row.feeDeclarationCode,
      row.createdById,
      {
        enterpriseId: row.enterpriseId ?? null,
        vehicles,
        cargoItems,
        transshipmentVehicles,
        appointment,
        submittedAt: row.submittedAt ?? null,
        qrCode: row.qrCode ?? null,
        epidemicFlag: row.epidemicFlag ?? false,
        epidemicMarkedBy: row.epidemicMarkedBy ?? null,
        epidemicMarkedAt: row.epidemicMarkedAt ?? null,
      },
    );
  }

  /** Dựng lái xe nhúng của một phương tiện từ các cột `driver_*`; rỗng khi xe chưa khai lái xe. */
  private static vehicleDriver(item: VehicleOrmEntity): DriverInfo | null {
    if (!item.driverFullName && !item.driverIdNumber && !item.driverPhone && !item.driverLicenseNumber) return null;
    return {
      fullName: item.driverFullName ?? '',
      idNumber: item.driverIdNumber ?? '',
      idType: orUndefined(item.driverIdType),
      phone: orUndefined(item.driverPhone),
      licenseNumber: orUndefined(item.driverLicenseNumber),
      nationality: orUndefined(item.driverNationality),
    };
  }

  /**
   * Dựng khối `cargo` một-dòng từ danh sách dòng hàng (bảng `cargo_items`) — nguồn duy nhất sau khi
   * gỡ cột `jsonb`. Lấy dòng đầu làm khối tóm tắt và gộp mọi loại kiểm dịch, đúng như domain làm ở
   * `setCargoItems`. Hồ sơ chưa có dòng hàng nào thì trả khối rỗng.
   */
  private static cargoFromItems(cargoItems: CargoItemInfo[]): CargoInfo {
    const first = cargoItems[0];
    if (!first) return { description: '' };
    return {
      description: first.description,
      quantity: first.quantity,
      grossWeightKg: first.grossWeightKg,
    };
  }

  static toPersistence(domain: Declaration): DeclarationOrmEntity {
    const row = new DeclarationOrmEntity();
    row.id = domain.id;
    row.code = domain.code;
    row.type = domain.type;
    row.status = domain.status;
    const rawType = (domain.enterprise?.accountType || '').trim().toUpperCase();
    const isInternal = rawType === 'INTERNAL' || Boolean(domain.enterprise?.email && !domain.enterprise?.taxCode && !domain.enterprise?.idNumber);
    // Cột enterpriseTaxCode chỉ lưu mã số thuế doanh nghiệp (không ghi CCCD hay 'INTERNAL' tránh sai ngữ nghĩa khi tìm kiếm / hiển thị)
    row.enterpriseTaxCode = (domain.enterprise?.taxCode || '').slice(0, 32);
    row.enterpriseId = domain.enterpriseId ?? null;
    // Cột scalar denormalized lấy theo **xe đầu** để phục vụ tìm kiếm/hiển thị nhanh ở danh sách.
    const firstVehicle = domain.vehicles[0];
    row.plateNumber = firstVehicle?.plateNumber ?? '';
    row.containerNumber = firstVehicle?.containerNumber;
    row.trailerNumber = firstVehicle?.trailerNumber;
    row.checkpoint = domain.checkpoint;
    const declarantAccount: Record<string, unknown> = {};
    if (domain.enterprise?.accountType) declarantAccount.accountType = domain.enterprise.accountType;
    if (domain.enterprise?.email) declarantAccount.email = domain.enterprise.email;
    if (domain.enterprise?.idNumber) declarantAccount.idNumber = domain.enterprise.idNumber;
    if (domain.enterprise?.jobTitle) declarantAccount.jobTitle = domain.enterprise.jobTitle;
    if (domain.enterprise?.department) declarantAccount.department = domain.enterprise.department;
    if (domain.enterprise?.createForOther !== undefined) declarantAccount.createForOther = domain.enterprise.createForOther;
    if (isInternal || rawType === 'INDIVIDUAL') {
      if (domain.enterprise?.name) declarantAccount.name = domain.enterprise.name;
      if (domain.enterprise?.phone) declarantAccount.phone = domain.enterprise.phone;
      if (domain.enterprise?.address) declarantAccount.address = domain.enterprise.address;
      if (domain.enterprise?.representativeName) declarantAccount.representativeName = domain.enterprise.representativeName;
    }

    row.declarantAccount = Object.keys(declarantAccount).length > 0 ? declarantAccount : null;
    row.workflowProgress = domain.workflowProgress || {};
    row.auditTrail = domain.auditTrail as never;
    row.feeDeclarationCode = domain.feeDeclarationCode;
    row.createdById = domain.createdById;
    row.submittedAt = domain.submittedAt ?? null;
    row.qrCode = domain.qrCode ?? null;
    row.epidemicFlag = domain.epidemicFlag;
    row.epidemicMarkedBy = domain.epidemicMarkedBy ?? null;
    row.epidemicMarkedAt = domain.epidemicMarkedAt ?? null;
    row.createdAt = domain.createdAt;
    row.updatedAt = domain.updatedAt;
    return row;
  }

  /** Doanh nghiệp dùng `taxCode` làm khóa tự nhiên nên bản ghi có sẵn thì điền bổ sung thông tin thiếu, bản ghi mới thì tạo. */
  static toEnterprisePersistence(
    enterprise: EnterpriseInfo,
    existing?: EnterpriseOrmEntity | null,
  ): EnterpriseOrmEntity {
    const row = existing ?? new EnterpriseOrmEntity();
    row.id = existing?.id ?? randomUUID();
    row.taxCode = (enterprise.taxCode || '').trim().slice(0, 32);
    row.name = existing?.name ? existing.name : (enterprise.name || enterprise.taxCode || existing?.taxCode || '');
    row.representativeName = existing?.representativeName ?? (enterprise.representativeName || null);
    row.address = existing?.address ?? (enterprise.address || null);
    row.phone = existing?.phone ?? (enterprise.phone || null);
    return row;
  }

  static toVehiclePersistence(dossierId: string, vehicle: VehicleInfo): VehicleOrmEntity {
    const row = new VehicleOrmEntity();
    row.id = vehicle.id ?? randomUUID();
    row.dossierId = dossierId;
    row.plateNumber = vehicle.plateNumber;
    row.containerNumber = vehicle.containerNumber ?? null;
    row.trailerNumber = vehicle.trailerNumber ?? null;
    row.transportLicenseNumber = vehicle.transportLicenseNumber ?? null;
    row.vehicleType = vehicle.vehicleType ?? null;
    row.weightKg = toNumericColumn(vehicle.weightKg);
    // Lái xe nhúng theo từng xe (BUG-033) — bảng `drivers` cũ không còn được ghi mới.
    const driver = vehicle.driver ?? null;
    row.driverFullName = driver?.fullName ?? null;
    row.driverIdNumber = driver?.idNumber ?? null;
    row.driverIdType = driver?.idType ?? null;
    row.driverPhone = driver?.phone ?? null;
    row.driverLicenseNumber = driver?.licenseNumber ?? null;
    row.driverNationality = driver?.nationality ?? null;
    return row;
  }

  static toCargoItemPersistence(dossierId: string, item: CargoItemInfo, lineNo: number): CargoItemOrmEntity {
    const row = new CargoItemOrmEntity();
    row.id = item.id ?? randomUUID();
    row.dossierId = dossierId;
    row.lineNo = lineNo;
    row.description = item.description;
    row.cargoTypeCode = item.cargoTypeCode ?? null;
    row.quantity = toNumericColumn(item.quantity);
    row.unitCode = item.unitCode ?? null;
    row.grossWeightKg = toNumericColumn(item.grossWeightKg);
    return row;
  }

  static toTransshipmentVehiclePersistence(
    dossierId: string,
    item: TransshipmentVehicleInfo,
    lineNo: number,
  ): TransshipmentVehicleOrmEntity {
    const row = new TransshipmentVehicleOrmEntity();
    row.id = item.id ?? randomUUID();
    row.dossierId = dossierId;
    row.lineNo = lineNo;
    row.sourcePlate = item.sourcePlate ?? null;
    row.plateNumber = item.plateNumber;
    row.vehicleType = item.vehicleType ?? null;
    row.containerNumber = item.containerNumber ?? null;
    row.trailerNumber = item.trailerNumber ?? null;
    row.driverName = item.driverName ?? null;
    row.fee01 = item.fee01 ?? null;
    row.transferPlace = item.transferPlace ?? null;
    row.note = item.note ?? null;
    return row;
  }

  static toAppointmentPersistence(dossierId: string, appointment: AppointmentInfo): AppointmentOrmEntity {
    const row = new AppointmentOrmEntity();
    row.id = appointment.id ?? randomUUID();
    row.dossierId = dossierId;
    row.scheduledAt = appointment.scheduledAt;
    row.gateCode = appointment.gateCode ?? null;
    row.laneCode = appointment.laneCode ?? null;
    row.status = appointment.status ?? AppointmentStatus.SCHEDULED;
    return row;
  }
}
