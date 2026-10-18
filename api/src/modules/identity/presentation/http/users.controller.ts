import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { AuthTokenPayload } from '../../application/services/auth-token.service';
import { ApproveUserUseCase } from '../../application/use-cases/approve-user.use-case';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { DeleteUserUseCase } from '../../application/use-cases/delete-user.use-case';
import { ListUsersUseCase } from '../../application/use-cases/list-users.use-case';
import { LockUserUseCase } from '../../application/use-cases/lock-user.use-case';
import { ReplaceUserAssignmentsUseCase } from '../../application/use-cases/replace-user-assignments.use-case';
import { ReplaceUserRolesUseCase } from '../../application/use-cases/replace-user-roles.use-case';
import { ResetUserPasswordUseCase } from '../../application/use-cases/reset-user-password.use-case';
import { UnlockUserUseCase } from '../../application/use-cases/unlock-user.use-case';
import { LookupUserUseCase } from '../../application/use-cases/lookup-user.use-case';
import { UpdateUserUseCase } from '../../application/use-cases/update-user.use-case';
import { LookupUserDto } from '../../application/dto/public-user.dto';
import { appForbidden } from '../../../../common/i18n';
import { CreateUserRequest } from './dto/create-user.request';
import { ListUsersRequest } from './dto/list-users.request';
import { LockUserRequest } from './dto/lock-user.request';
import { ReplaceUserAssignmentsRequest } from './dto/replace-user-assignments.request';
import { ReplaceUserRolesRequest } from './dto/replace-user-roles.request';
import { ResetPasswordRequest } from './dto/reset-password.request';
import { UpdateUserRequest } from './dto/update-user.request';

const PRIVILEGED_ROLES = new Set([
  'SYS_ADMIN',
  'BORDER_GUARD',
  'CUSTOMS',
  'QUARANTINE',
  'FEE_COLLECTOR',
  'DISPATCHER',
  'YARD_MANAGER',
  'MANAGEMENT',
]);

/** Quản trị người dùng thuộc phân hệ "Hệ thống" trong ma trận quyền, nên dùng nhóm mã `system.*`. */
@ApiBearerAuth()
@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly listUsers: ListUsersUseCase,
    private readonly createUser: CreateUserUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly deleteUser: DeleteUserUseCase,
    private readonly resetPassword: ResetUserPasswordUseCase,
    private readonly lockUser: LockUserUseCase,
    private readonly unlockUser: UnlockUserUseCase,
    private readonly approveUser: ApproveUserUseCase,
    private readonly replaceRoles: ReplaceUserRolesUseCase,
    private readonly replaceAssignments: ReplaceUserAssignmentsUseCase,
    private readonly lookupUser: LookupUserUseCase,
  ) {}

  @RequirePermission('dossier.create', 'system.view')
  @Get('lookup')
  async lookup(
    @Query('taxCode') taxCode?: string,
    @Query('idNumber') idNumber?: string,
    @Query('email') email?: string,
    @Query('accountType') accountType?: string,
    @CurrentUser() currentUser?: AuthTokenPayload,
  ): Promise<LookupUserDto | null> {
    const roles = currentUser?.roles || [];
    const isPrivileged = roles.some((role) => PRIVILEGED_ROLES.has(role));
    if (!isPrivileged) {
      throw appForbidden('auth.permissionDenied');
    }
    return this.lookupUser.execute({ taxCode, idNumber, email, accountType });
  }

  @RequirePermission('system.view')
  @Get()
  list(@Query() query: ListUsersRequest) {
    return this.listUsers.execute({
      roleCode: query.role,
      status: query.status,
      keyword: query.keyword,
      organizationId: query.organizationId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @RequirePermission('system.create')
  @Post()
  create(@Body() body: CreateUserRequest) {
    return this.createUser.execute(body);
  }

  @RequirePermission('system.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateUserRequest) {
    return this.updateUser.execute({ ...body, userId: id });
  }

  @RequirePermission('system.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthTokenPayload) {
    return this.deleteUser.execute(id, actor.sub);
  }

  @RequirePermission('system.update')
  @Post(':id/actions/reset-password')
  reset(@Param('id') id: string, @Body() body: ResetPasswordRequest) {
    return this.resetPassword.execute(id, body.newPassword);
  }

  @RequirePermission('system.update')
  @Post(':id/actions/lock')
  lock(@Param('id') id: string, @Body() body: LockUserRequest, @CurrentUser() actor: AuthTokenPayload) {
    return this.lockUser.execute(id, body.reason, actor.sub);
  }

  @RequirePermission('system.update')
  @Post(':id/actions/unlock')
  unlock(@Param('id') id: string) {
    return this.unlockUser.execute(id);
  }

  /** F00 — duyệt tài khoản tự đăng ký (PENDING → ACTIVE). */
  @RequirePermission('system.update')
  @Post(':id/actions/approve')
  approve(@Param('id') id: string) {
    return this.approveUser.execute(id);
  }

  @RequirePermission('system.update')
  @Put(':id/roles')
  roles(@Param('id') id: string, @Body() body: ReplaceUserRolesRequest) {
    return this.replaceRoles.execute({ userId: id, roles: body.roles });
  }

  @RequirePermission('system.update')
  @Put(':id/assignments')
  assignments(@Param('id') id: string, @Body() body: ReplaceUserAssignmentsRequest) {
    return this.replaceAssignments.execute({ userId: id, assignments: body.assignments });
  }
}
