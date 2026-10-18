import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** `forbidNonWhitelisted` đang bật nên mọi trường web gửi lên phải được khai đủ ở đây. */
export class AssignDispatchRequest {
  @IsUUID('4', { message: 'Mã hồ sơ không đúng định dạng.' })
  dossierId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã cổng tối đa 32 ký tự.' })
  gateCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã làn tối đa 32 ký tự.' })
  laneCode?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Mã khu bãi không đúng định dạng.' })
  yardId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã ô đỗ tối đa 32 ký tự.' })
  slotCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự.' })
  note?: string;
}

/**
 * Chuyển vị trí (F31). `@IsOptional()` của class-validator bỏ qua cả `undefined` **và** `null`,
 * nên web gửi `null` tường minh là để **bỏ trống** vị trí đó, còn không gửi trường là **giữ nguyên**.
 */
export class MoveDispatchRequest {
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã cổng tối đa 32 ký tự.' })
  gateCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã làn tối đa 32 ký tự.' })
  laneCode?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'Mã khu bãi không đúng định dạng.' })
  yardId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã ô đỗ tối đa 32 ký tự.' })
  slotCode?: string | null;
}
