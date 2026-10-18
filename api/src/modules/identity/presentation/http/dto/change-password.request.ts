import { IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../../../../common/validators/strong-password.decorator';

export class ChangePasswordRequest {
  @IsString()
  @MinLength(1, { message: 'Bắt buộc nhập mật khẩu hiện tại.' })
  currentPassword!: string;

  @IsStrongPassword()
  newPassword!: string;
}
