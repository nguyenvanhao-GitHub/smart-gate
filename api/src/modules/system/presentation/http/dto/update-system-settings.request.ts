import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

export class SystemSettingUpdateItemRequest {
  @IsString()
  @IsNotEmpty({ message: 'Thiếu mã tham số cấu hình.' })
  key!: string;

  // Giá trị nhận dạng chuỗi (kể cả số) — tầng domain ép/kiểm kiểu theo định nghĩa tham số.
  @IsString({ message: 'Giá trị tham số cấu hình phải là chuỗi.' })
  @IsNotEmpty({ message: 'Thiếu giá trị tham số cấu hình.' })
  value!: string;
}

export class UpdateSystemSettingsRequest {
  @IsArray({ message: 'Danh sách tham số cấu hình phải là mảng.' })
  @ArrayMinSize(1, { message: 'Phải có ít nhất một tham số cần cập nhật.' })
  @ArrayMaxSize(50, { message: 'Chỉ cập nhật tối đa 50 tham số một lần.' })
  @ValidateNested({ each: true })
  @Type(() => SystemSettingUpdateItemRequest)
  items!: SystemSettingUpdateItemRequest[];
}
