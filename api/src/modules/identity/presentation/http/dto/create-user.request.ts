import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsStrongPassword } from '../../../../../common/validators/strong-password.decorator';
import { AccountType } from '../../../domain/user.entity';

export class CreateUserRequest {
  @IsString()
  @MinLength(3, { message: 'Tên đăng nhập tối thiểu 3 ký tự.' })
  @MaxLength(64, { message: 'Tên đăng nhập tối đa 64 ký tự.' })
  username!: string;

  @IsStrongPassword()
  password!: string;

  @IsString()
  displayName!: string;

  @IsString()
  title!: string;

  /** Trang mặc định sau đăng nhập. Bỏ trống thì API tự suy ra từ loại tài khoản. */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  defaultRoute?: string;

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

  /** Loại tài khoản: DN/cá nhân; bỏ trống = tài khoản nội bộ. */
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
