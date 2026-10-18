import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);
const trimNullable = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export class UpdateProfileRequest {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Họ tên hiển thị tối thiểu 2 ký tự.' })
  @MaxLength(160, { message: 'Họ tên hiển thị tối đa 160 ký tự.' })
  displayName?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(160, { message: 'Chức danh tối đa 160 ký tự.' })
  title?: string;

  // Email là định danh liên hệ bắt buộc (F01): nếu có gửi thì không được để trống — chặn "xóa trắng".
  // Dùng `trim` (không phải `trimNullable`) để chuỗi rỗng giữ nguyên '' và bị `@IsNotEmpty` bắt lỗi,
  // thay vì bị chuyển thành `null` rồi lọt qua `@IsOptional`.
  @Transform(trim)
  @IsOptional()
  @IsNotEmpty({ message: 'Thư điện tử không được để trống.' })
  @IsEmail({}, { message: 'Địa chỉ email không hợp lệ.' })
  @MaxLength(160)
  email?: string;

  @Transform(trimNullable)
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Số điện thoại tối đa 32 ký tự.' })
  phone?: string | null;

  @Transform(trimNullable)
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Địa chỉ liên hệ tối đa 255 ký tự.' })
  address?: string | null;

  @Transform(trimNullable)
  @IsOptional()
  @IsString()
  @MaxLength(160, { message: 'Người đại diện tối đa 160 ký tự.' })
  representativeName?: string | null;

  @Transform(trimNullable)
  @IsOptional()
  @IsString()
  avatarUrl?: string | null;
}
