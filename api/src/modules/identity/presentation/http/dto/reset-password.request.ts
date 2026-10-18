import { IsString, MinLength } from 'class-validator';

export class ResetPasswordRequest {
  @IsString()
  @MinLength(6)
  newPassword!: string;
}
