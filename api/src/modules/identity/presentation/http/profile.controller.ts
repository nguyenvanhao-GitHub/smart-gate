import { Body, Controller, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { AuthenticatedOnly } from '../../../../common/auth/require-permission.decorator';
import { AuthTokenPayload } from '../../application/services/auth-token.service';
import { ChangePasswordUseCase } from '../../application/use-cases/change-password.use-case';
import { UpdateProfileUseCase } from '../../application/use-cases/update-profile.use-case';
import { ChangePasswordRequest } from './dto/change-password.request';
import { UpdateProfileRequest } from './dto/update-profile.request';

/** Hồ sơ cá nhân (F01): chỉ cần đăng nhập hợp lệ, không ràng buộc quyền theo phân hệ. */
@ApiBearerAuth()
@ApiTags('Profile')
@AuthenticatedOnly()
@Controller('profile')
export class ProfileController {
  constructor(
    private readonly updateProfile: UpdateProfileUseCase,
    private readonly changePassword: ChangePasswordUseCase,
  ) {}

  @Patch()
  update(@Body() body: UpdateProfileRequest, @CurrentUser() actor: AuthTokenPayload) {
    return this.updateProfile.execute({ ...body, userId: actor.sub });
  }

  @Post('actions/change-password')
  password(@Body() body: ChangePasswordRequest, @CurrentUser() actor: AuthTokenPayload) {
    return this.changePassword.execute({ ...body, userId: actor.sub });
  }
}
