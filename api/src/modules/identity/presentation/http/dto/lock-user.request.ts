import { IsString, MaxLength, MinLength } from 'class-validator';

/** F03: khóa tài khoản bắt buộc có lý do, đúng như modal khóa của mockup UI-13. */
export class LockUserRequest {
  @IsString()
  @MinLength(3, { message: 'Lý do khóa tài khoản tối thiểu 3 ký tự.' })
  @MaxLength(255, { message: 'Lý do khóa tài khoản tối đa 255 ký tự.' })
  reason!: string;
}
