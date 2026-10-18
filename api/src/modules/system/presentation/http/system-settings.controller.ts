import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { AuthTokenPayload } from '../../../identity/application/services/auth-token.service';
import { ListSystemSettingsUseCase } from '../../application/use-cases/list-system-settings.use-case';
import { UpdateSystemSettingsUseCase } from '../../application/use-cases/update-system-settings.use-case';
import { UpdateSystemSettingsRequest } from './dto/update-system-settings.request';

/** Màn "Cấu hình hệ thống" (BA-092) — xem cần `system.view`, sửa cần `system.update` (chỉ SYS_ADMIN). */
@ApiBearerAuth()
@ApiTags('System')
@Controller('system')
export class SystemSettingsController {
  constructor(
    private readonly listSettings: ListSystemSettingsUseCase,
    private readonly updateSettings: UpdateSystemSettingsUseCase,
  ) {}

  @RequirePermission('system.view')
  @Get('settings')
  list() {
    return this.listSettings.execute();
  }

  @RequirePermission('system.update')
  @Put('settings')
  update(@Body() body: UpdateSystemSettingsRequest, @CurrentUser() actor: AuthTokenPayload) {
    return this.updateSettings.execute({ items: body.items, actorId: actor.sub });
  }
}
