import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AccountType, UserStatus } from '../../../domain/user.entity';

export class UpdateUserRequest {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Đường dẫn mặc định không được để trống.' })
  @MaxLength(160)
  defaultRoute?: string;

  @IsOptional()
  @IsEnum(UserStatus, { message: 'Trạng thái tài khoản chỉ nhận ACTIVE, LOCKED hoặc PENDING.' })
  status?: UserStatus;

  @IsOptional()
  @IsEmail({}, { message: 'Địa chỉ email không hợp lệ.' })
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Số điện thoại tối đa 32 ký tự.' })
  phone?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Mã đơn vị phải là UUID.' })
  organizationId?: string;

  @IsOptional()
  @IsEnum(AccountType, { message: 'Loại tài khoản chỉ nhận doanh nghiệp hoặc cá nhân.' })
  accountType?: AccountType;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã số thuế tối đa 32 ký tự.' })
  taxCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160, { message: 'Người đại diện tối đa 160 ký tự.' })
  representativeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Số CCCD/hộ chiếu tối đa 32 ký tự.' })
  idNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Địa chỉ liên hệ tối đa 255 ký tự.' })
  address?: string;
}
