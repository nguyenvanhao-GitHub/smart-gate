import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CheckpointCode, DeclarationType } from '../../../domain/declaration.enums';
import {
  AppointmentPartRequest,
  CargoItemPartRequest,
  EnterprisePartRequest,
  TransshipmentVehiclePartRequest,
  VehiclePartRequest,
} from './dossier-parts.request';

/**
 * Tạo hồ sơ **nháp**. Chỉ bắt buộc những trường là khóa lưu trữ (mã số thuế doanh nghiệp, biển
 * kiểm soát); phần còn lại doanh nghiệp bổ sung dần và chỉ bị kiểm đủ khi bấm gửi hồ sơ.
 */
export class CreateDeclarationRequest {
  @IsEnum(DeclarationType, { message: 'Loại hình hồ sơ không hợp lệ.' })
  type!: DeclarationType;

  /** Chốt làm thủ tục do doanh nghiệp chọn. Bỏ trống thì hồ sơ mặc định vào luồng cửa khẩu số. */
  @IsOptional()
  @IsEnum(CheckpointCode, { message: 'Mã chốt không hợp lệ.' })
  checkpoint?: CheckpointCode;

  @ValidateNested()
  @Type(() => EnterprisePartRequest)
  enterprise!: EnterprisePartRequest;

  /** Một hồ sơ nhiều xe, mỗi xe kèm lái xe. Ở bước nháp cho phép danh sách rỗng; kiểm đủ khi gửi (F13). */
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

  /** Phương tiện nhận sang tải (CR9) — chỉ có ý nghĩa khi loại hồ sơ là Sang tải. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransshipmentVehiclePartRequest)
  transshipmentVehicles?: TransshipmentVehiclePartRequest[];

  @IsOptional()
  @ValidateNested()
  @Type(() => AppointmentPartRequest)
  appointment?: AppointmentPartRequest;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  feeDeclarationCode?: string;
}
