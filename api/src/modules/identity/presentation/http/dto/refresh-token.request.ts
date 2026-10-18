import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenRequest {
  @ApiProperty({
    description: 'Refresh token hợp lệ do hệ thống cấp lúc đăng nhập hoặc lần làm mới trước',
    example: 'eyJzdWI...b2R5.c2lnbmF0dXJl',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
