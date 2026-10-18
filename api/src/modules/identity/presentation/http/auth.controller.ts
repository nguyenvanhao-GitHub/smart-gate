import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { Public } from '../../../../common/auth/public.decorator';
import { AuthenticatedOnly } from '../../../../common/auth/require-permission.decorator';
import { AuthTokenPayload } from '../../application/services/auth-token.service';
import { IdentityService } from '../../application/services/identity.service';
import { RegisterUserUseCase } from '../../application/use-cases/register-user.use-case';
import { LoginRequest } from './dto/login.request';
import { RefreshTokenRequest } from './dto/refresh-token.request';
import { RegisterRequest } from './dto/register.request';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly identity: IdentityService,
    private readonly registerUser: RegisterUserUseCase,
  ) {}

  @Public()
  @Post('login')
  login(@Body() body: LoginRequest) {
    return this.identity.login(body.username, body.password);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() body: RefreshTokenRequest) {
    return this.identity.refresh(body.refreshToken);
  }

  /**
   * F00 — Đăng ký tự phục vụ. Tạo tài khoản chờ duyệt (`PENDING`); không trả token vì
   * chưa đăng nhập được cho tới khi admin duyệt.
   */
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Post('register')
  register(@Body() body: RegisterRequest) {
    return this.registerUser.execute(body);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  forgotPassword(@Body() body: { email: string }) {
    return this.identity.sendForgotPasswordEmail(body.email);
  }

  /** Ai đăng nhập cũng xem được hồ sơ của chính mình — không gắn quyền theo phân hệ. */
  @ApiBearerAuth()
  @AuthenticatedOnly()
  @Get('me')
  me(@CurrentUser() actor: AuthTokenPayload) {
    return this.identity.me(actor);
  }
}
