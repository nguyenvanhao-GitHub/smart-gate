import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateRoleRequest {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Tên vai trò tối thiểu 2 ký tự.' })
  @MaxLength(160, { message: 'Tên vai trò tối đa 160 ký tự.' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Mô tả tối đa 255 ký tự.' })
  description?: string;
}
