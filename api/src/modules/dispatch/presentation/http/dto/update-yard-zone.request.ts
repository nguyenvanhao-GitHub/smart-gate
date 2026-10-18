import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Body `PATCH /catalog/yard-zones/:code` (F42). ValidationPipe kiểm; chỉ gửi phần cần đổi. */
export class UpdateYardZoneRequest {
  @IsOptional()
  @IsString({ message: 'Tên khu bãi phải là chuỗi.' })
  @MaxLength(120, { message: 'Tên khu bãi không được vượt quá 120 ký tự.' })
  name?: string;

  @IsOptional()
  @IsInt({ message: 'Sức chứa phải là số nguyên.' })
  @Min(0, { message: 'Sức chứa không được nhỏ hơn 0.' })
  @Max(100000, { message: 'Sức chứa vượt quá giới hạn cho phép.' })
  capacity?: number;
}
