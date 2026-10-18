import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRoleRequest {
  @IsString()
  @MinLength(2, { message: 'Mã vai trò tối thiểu 2 ký tự.' })
  @MaxLength(64, { message: 'Mã vai trò tối đa 64 ký tự.' })
  code!: string;

  @IsString()
  @MinLength(2, { message: 'Tên vai trò tối thiểu 2 ký tự.' })
  @MaxLength(160, { message: 'Tên vai trò tối đa 160 ký tự.' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Mô tả tối đa 255 ký tự.' })
  description?: string;
}
