import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { AppointmentStatus } from '../../../domain/declaration.enums';

/**
 * Các khối dữ liệu dùng chung cho cả tạo mới và cập nhật hồ sơ.
 */
export const ACCOUNT_TYPE = {
  ENTERPRISE: 'ENTERPRISE',
  INDIVIDUAL: 'INDIVIDUAL',
  INTERNAL: 'INTERNAL',
} as const;

export function isRequiredIdentity(
  body: EnterprisePartRequest,
  field: 'taxCode' | 'idNumber' | 'email',
): boolean {
  const isPresent = body[field] !== undefined && body[field] !== null && body[field] !== '';
  if (isPresent) return true;

  const targetType = body.accountType || ACCOUNT_TYPE.ENTERPRISE;
  if (field === 'taxCode') return targetType === ACCOUNT_TYPE.ENTERPRISE;
  if (field === 'idNumber') return targetType === ACCOUNT_TYPE.INDIVIDUAL;
  if (field === 'email') return targetType === ACCOUNT_TYPE.INTERNAL && body.createForOther === true;
  return false;
}

/**
 * Ở bước khai báo tạo hồ sơ, trường định danh bắt buộc phân nhánh theo `accountType`:
 * - `ENTERPRISE` (mặc định): bắt buộc `taxCode` (mã số thuế).
 * - `INDIVIDUAL`: bắt buộc `idNumber` (số CCCD/hộ chiếu).
 * - `INTERNAL`: bắt buộc `email` khi khai hộ (`createForOther = true`).
 * Các trường thông tin chi tiết khác cho phép để trống khi lưu nháp; ràng buộc đầy đủ được kiểm
 * tra tại `dossier-completeness.rules.ts` khi gửi hồ sơ.
 */
export class EnterprisePartRequest {
  /** Mã số thuế — bắt buộc khi accountType là ENTERPRISE hoặc mặc định; luôn kiểm tra tối đa 32 ký tự nếu truyền. */
  @ValidateIf((body: EnterprisePartRequest) => isRequiredIdentity(body, 'taxCode'))
  @IsNotEmpty({ message: 'dossier.missingEnterpriseTaxCode' })
  @IsString({ message: 'dossier.invalidEnterpriseTaxCode' })
  @MaxLength(32)
  taxCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  representativeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  /** Email — bắt buộc khi accountType là INTERNAL; luôn kiểm tra tối đa 160 ký tự nếu truyền. */
  @ValidateIf((body: EnterprisePartRequest) => isRequiredIdentity(body, 'email'))
  @IsNotEmpty({ message: 'dossier.missingEmail' })
  @IsString({ message: 'dossier.invalidEmail' })
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  department?: string;

  /** Số CCCD/Hộ chiếu — bắt buộc khi accountType là INDIVIDUAL; luôn kiểm tra tối đa 32 ký tự nếu truyền. */
  @ValidateIf((body: EnterprisePartRequest) => isRequiredIdentity(body, 'idNumber'))
  @IsNotEmpty({ message: 'dossier.missingIdNumber' })
  @IsString({ message: 'dossier.invalidIdNumber' })
  @MaxLength(32)
  idNumber?: string;

  @IsOptional()
  @IsString()
  @IsIn([ACCOUNT_TYPE.ENTERPRISE, ACCOUNT_TYPE.INDIVIDUAL, ACCOUNT_TYPE.INTERNAL])
  @MaxLength(32)
  accountType?: string;

  @IsOptional()
  @IsBoolean()
  createForOther?: boolean;
}

export class VehiclePartRequest {
  /** Web gửi lại nguyên danh sách xe khi sửa hồ sơ nháp nên phải nhận `id` đã có, như dòng hàng. */
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MaxLength(32)
  plateNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  containerNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  trailerNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  transportLicenseNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  vehicleType?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Trọng lượng phương tiện phải là số.' })
  weightKg?: number;

  /** Lái xe của chính xe này (BUG-033). Ở bước nháp cho phép trống; kiểm đủ khi gửi (F13). */
  @IsOptional()
  @ValidateNested()
  @Type(() => DriverPartRequest)
  driver?: DriverPartRequest | null;
}

export class DriverPartRequest {
  @IsString()
  @MaxLength(160)
  fullName!: string;

  @IsString()
  @MaxLength(32)
  idNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  idType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  nationality?: string;
}

export class CargoItemPartRequest {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  cargoTypeCode?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Số lượng phải là số.' })
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unitCode?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Khối lượng phải là số.' })
  grossWeightKg?: number;
}

/**
 * Phương tiện nhận sang tải (CR9/CR18/CR33) — chỉ dùng cho hồ sơ loại Sang tải. Ở bước khai báo DTO
 * cố tình dễ dãi (lưu nháp được với dữ liệu thiếu); các trường bắt buộc theo mockup do web tự nhắc.
 */
export class TransshipmentVehiclePartRequest {
  @IsOptional()
  @IsString()
  id?: string;

  /** Biển số xe chở hàng gốc (chọn từ phương tiện của hồ sơ). */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  sourcePlate?: string;

  @IsString()
  @MaxLength(32)
  plateNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  vehicleType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  containerNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  trailerNumber?: string;

  /** Tên lái xe nhận sang tải (mockup chỉ khai tên). */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  driverName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  fee01?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  transferPlace?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AppointmentPartRequest {
  /** Web gửi lại nguyên khối lịch hẹn khi sửa hồ sơ nháp nên phải nhận `id` đã có, như dòng hàng. */
  @IsOptional()
  @IsString()
  id?: string;

  @IsDateString({}, { message: 'Thời gian hẹn không đúng định dạng.' })
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  gateCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  laneCode?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus, { message: 'Trạng thái lịch hẹn không hợp lệ.' })
  status?: AppointmentStatus;
}
