import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CheckpointCode, DeclarationType } from '../../../domain/declaration.enums';
import {
  AppointmentPartRequest,
  CargoItemPartRequest,
  TransshipmentVehiclePartRequest,
  VehiclePartRequest,
} from './dossier-parts.request';

/** Doanh nghiệp có thể sửa từng phần nên mọi trường của khối doanh nghiệp đều tùy chọn. */
class EnterpriseUpdateRequest {
  @IsOptional()
  @IsString()
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

  @IsOptional()
  @IsString()
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

  @IsOptional()
  @IsString()
  @MaxLength(32)
  idNumber?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ENTERPRISE', 'INDIVIDUAL', 'INTERNAL'])
  @MaxLength(32)
  accountType?: string;

  @IsOptional()
  @IsBoolean()
  createForOther?: boolean;
}

/**
 * Cập nhật hồ sơ nháp. `appointment` nhận `null` để **xoá** phần đó khỏi hồ sơ; bỏ trống trường nghĩa
 * là giữ nguyên. `cargoItems` và `vehicles` gửi lên là **thay toàn bộ** danh sách (lái xe nhúng theo xe).
 */
export class UpdateDeclarationRequest {
  @IsOptional()
  @IsEnum(DeclarationType, { message: 'Loại hình hồ sơ không hợp lệ.' })
  type?: DeclarationType;

  /** Đổi chốt làm thủ tục khi hồ sơ còn là nháp. */
  @IsOptional()
  @IsEnum(CheckpointCode, { message: 'Mã chốt không hợp lệ.' })
  checkpoint?: CheckpointCode;

  @IsOptional()
  @ValidateNested()
  @Type(() => EnterpriseUpdateRequest)
  enterprise?: EnterpriseUpdateRequest;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VehiclePartRequest)
  vehicles?: VehiclePartRequest[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CargoItemPartRequest)
  cargoItems?: CargoItemPartRequest[];

  /** Phương tiện nhận sang tải (CR9) — thay toàn bộ danh sách; chỉ dùng cho hồ sơ Sang tải. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransshipmentVehiclePartRequest)
  transshipmentVehicles?: TransshipmentVehiclePartRequest[];

  @IsOptional()
  @ValidateNested()
  @Type(() => AppointmentPartRequest)
  appointment?: AppointmentPartRequest | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  feeDeclarationCode?: string;
}
