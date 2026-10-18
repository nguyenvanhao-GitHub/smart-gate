import { IsEmail, IsEnum, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { IsStrongPassword } from '../../../../../common/validators/strong-password.decorator';
import { AccountType } from '../../../domain/user.entity';

/**
 * F00 — thân yêu cầu đăng ký tự phục vụ.
 *
 * `accountType` quyết định trường định danh bắt buộc kèm theo (SRS UI-01): tài khoản doanh nghiệp
 * bắt buộc `taxCode`, tài khoản cá nhân bắt buộc `idNumber`. `@ValidateIf` chỉ kiểm trường tương ứng
 * với loại đã chọn — trường của loại còn lại được bỏ qua (ValidationPipe `whitelist` sẽ loại nó khỏi body).
 */
export class RegisterRequest {
  @IsEnum(AccountType, { message: 'Loại tài khoản chỉ nhận doanh nghiệp hoặc cá nhân.' })
  accountType!: AccountType;

  @IsString()
  @MinLength(3, { message: 'Tên đăng nhập tối thiểu 3 ký tự.' })
  @MaxLength(64, { message: 'Tên đăng nhập tối đa 64 ký tự.' })
  username!: string;

  @IsStrongPassword()
  password!: string;

  @IsString()
  @MinLength(2, { message: 'Tên tối thiểu 2 ký tự.' })
  @MaxLength(160, { message: 'Tên tối đa 160 ký tự.' })
  displayName!: string;

  /** Mã số thuế — bắt buộc với tài khoản doanh nghiệp. */
  @ValidateIf((body: RegisterRequest) => body.accountType === AccountType.ENTERPRISE)
  @IsString()
  @MinLength(10, { message: 'Mã số thuế phải từ 10 đến 14 ký tự.' })
  @MaxLength(14, { message: 'Mã số thuế phải từ 10 đến 14 ký tự.' })
  taxCode?: string;

  /** Người đại diện — bắt buộc với tài khoản doanh nghiệp. */
  @ValidateIf((body: RegisterRequest) => body.accountType === AccountType.ENTERPRISE)
  @IsString()
  @MinLength(2, { message: 'Người đại diện tối thiểu 2 ký tự.' })
  @MaxLength(160, { message: 'Người đại diện tối đa 160 ký tự.' })
  representativeName?: string;

  /** Số CCCD/hộ chiếu — bắt buộc với tài khoản cá nhân. */
  @ValidateIf((body: RegisterRequest) => body.accountType === AccountType.INDIVIDUAL)
  @IsString()
  @MinLength(6, { message: 'Số CCCD/hộ chiếu phải từ 6 đến 32 ký tự.' })
  @MaxLength(32, { message: 'Số CCCD/hộ chiếu phải từ 6 đến 32 ký tự.' })
  idNumber?: string;

  /** Địa chỉ liên hệ — bắt buộc với cả doanh nghiệp lẫn cá nhân. */
  @IsString()
  @MinLength(3, { message: 'Địa chỉ liên hệ tối thiểu 3 ký tự.' })
  @MaxLength(255, { message: 'Địa chỉ liên hệ tối đa 255 ký tự.' })
  address!: string;

  @IsEmail({}, { message: 'Địa chỉ email không hợp lệ.' })
  @MaxLength(160)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Số điện thoại tối thiểu 8 ký tự.' })
  @MaxLength(32, { message: 'Số điện thoại tối đa 32 ký tự.' })
  phone!: string;
}
