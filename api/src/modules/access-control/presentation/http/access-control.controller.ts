import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { AuthenticatedOnly, RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { AuthTokenPayload } from '../../../identity/application/services/auth-token.service';
import { PermissionCatalogService } from '../../application/permission-catalog.service';
import { CreateRoleUseCase } from '../../application/use-cases/create-role.use-case';
import { DeleteRoleUseCase } from '../../application/use-cases/delete-role.use-case';
import { GetMyAccessUseCase } from '../../application/use-cases/get-my-access.use-case';
import { GetRolePermissionsUseCase } from '../../application/use-cases/get-role-permissions.use-case';
import { ListPermissionCatalogUseCase } from '../../application/use-cases/list-permission-catalog.use-case';
import { ListRolesUseCase } from '../../application/use-cases/list-roles.use-case';
import { ReplaceRolePermissionsUseCase } from '../../application/use-cases/replace-role-permissions.use-case';
import { SetRoleActiveUseCase } from '../../application/use-cases/set-role-active.use-case';
import { UpdateRoleUseCase } from '../../application/use-cases/update-role.use-case';
import { UserRoleCode } from '../../domain/role.enum';
import { CreateRoleRequest } from './dto/create-role.request';
import { ReplaceRolePermissionsRequest } from './dto/replace-role-permissions.request';
import { UpdateRoleRequest } from './dto/update-role.request';

@ApiBearerAuth()
@ApiTags('Access control')
@Controller('access-control')
export class AccessControlController {
  constructor(
    private readonly getMyAccess: GetMyAccessUseCase,
    private readonly listPermissionCatalog: ListPermissionCatalogUseCase,
    private readonly listRoles: ListRolesUseCase,
    private readonly createRole: CreateRoleUseCase,
    private readonly updateRole: UpdateRoleUseCase,
    private readonly deleteRole: DeleteRoleUseCase,
    private readonly getRolePermissions: GetRolePermissionsUseCase,
    private readonly replaceRolePermissions: ReplaceRolePermissionsUseCase,
    private readonly setRoleActive: SetRoleActiveUseCase,
    private readonly legacyNavigation: PermissionCatalogService,
  ) {}

  /** Quyền của chính người dùng — ai đăng nhập cũng xem được, không cần quyền riêng. */
  @AuthenticatedOnly()
  @Get('me')
  me(@CurrentUser() actor: AuthTokenPayload) {
    return this.getMyAccess.execute(actor.sub);
  }

  @RequirePermission('system.view')
  @Get('permissions')
  permissions() {
    return this.listPermissionCatalog.execute();
  }

  @RequirePermission('system.view')
  @Get('roles')
  roles() {
    return this.listRoles.execute();
  }

  @RequirePermission('system.create')
  @Post('roles')
  create(@Body() body: CreateRoleRequest) {
    return this.createRole.execute(body);
  }

  @RequirePermission('system.update')
  @Patch('roles/:id')
  update(@Param('id') id: string, @Body() body: UpdateRoleRequest) {
    return this.updateRole.execute({ ...body, roleId: id });
  }

  @RequirePermission('system.delete')
  @Delete('roles/:id')
  remove(@Param('id') id: string) {
    return this.deleteRole.execute(id);
  }

  @RequirePermission('system.update')
  @Post('roles/:id/lock')
  lock(@Param('id') id: string) {
    return this.setRoleActive.execute(id, false);
  }

  @RequirePermission('system.update')
  @Post('roles/:id/unlock')
  unlock(@Param('id') id: string) {
    return this.setRoleActive.execute(id, true);
  }

  @RequirePermission('system.view')
  @Get('roles/:id/permissions')
  rolePermissions(@Param('id') id: string) {
    return this.getRolePermissions.execute(id);
  }

  @RequirePermission('system.update')
  @Put('roles/:id/permissions')
  saveRolePermissions(@Param('id') id: string, @Body() body: ReplaceRolePermissionsRequest) {
    return this.replaceRolePermissions.execute({ roleId: id, permissions: body.permissions });
  }

  /**
   * Menu theo vai trò cứng cũ — giữ tạm cho web bản hiện tại. Web chuyển sang `GET /access-control/me`
   * (trường `menu`) thì gỡ endpoint này cùng `PermissionCatalogService`.
   */
  @AuthenticatedOnly()
  @Get('menu')
  menu(@Query('role') role?: UserRoleCode) {
    return this.legacyNavigation.listNavigation(role);
  }
}
