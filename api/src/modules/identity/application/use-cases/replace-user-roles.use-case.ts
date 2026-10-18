import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import {
  USER_ACCESS_REPOSITORY,
  UserAccessRepository,
} from '../../../access-control/application/ports/user-access.repository';
import { PublicUserRoleDto } from '../dto/public-user.dto';
import { ReplaceUserRolesCommand } from '../dto/replace-user-access.command';
import { USER_REPOSITORY, UserRepository } from '../ports/user.repository';
import {
  isSelfRegisteredAccountType,
  selfRegisteredRoleGrants,
} from '../services/self-registered-role';
import { defaultRouteForRoles } from '../services/default-route';
import { appNotFound } from '../../../../common/i18n';

/** Gán lại toàn bộ vai trò của một tài khoản (màn UI-13). Đơn vị lấy theo `users.organization_id`. */
@Injectable()
export class ReplaceUserRolesUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(USER_ACCESS_REPOSITORY)
    private readonly userAccess: UserAccessRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: ReplaceUserRolesCommand): Promise<PublicUserRoleDto[]> {
    const user = await this.users.findById(command.userId);
    if (!user) throw appNotFound('user.notFound');

    // Bất biến: DN → ENTERPRISE, cá nhân → INDIVIDUAL, cùng phạm vi OWN. Bỏ qua vai trò admin gửi
    // lên — loại tài khoản quyết định vai trò, không cho đổi sang lực lượng nội bộ.
    const grants = isSelfRegisteredAccountType(user.accountType)
      ? selfRegisteredRoleGrants(user.accountType)
      : command.roles.map((role) => ({ roleCode: role.roleCode, dataScope: role.dataScope }));

    const before = await this.userAccess.listRoles(command.userId);
    if (user.isProtected) {
      const sysAdminRole = before.find((r) => r.roleCode === 'SYS_ADMIN');
      if (!grants.some((g) => g.roleCode === 'SYS_ADMIN')) {
        grants.push({ roleCode: 'SYS_ADMIN', dataScope: sysAdminRole?.dataScope || DataScopeLevel.ALL });
      }
    }

    const beforeDefaultRoute = user.defaultRoute;
    const oldDerivedRoute = defaultRouteForRoles(
      before.map((role) => role.roleCode),
      user.accountType,
    );
    const newDerivedRoute = defaultRouteForRoles(
      grants.map((role) => role.roleCode),
      user.accountType,
    );

    const after = await this.userAccess.replaceRoles(command.userId, grants);

    // Chỉ tự động cập nhật route khi route hiện tại là route tự suy từ vai trò cũ (chưa bị admin chỉnh tay)
    // hoặc khi trước đó chưa có route.
    const isAutoRoute = !user.defaultRoute || user.defaultRoute === oldDerivedRoute;
    if (isAutoRoute && user.defaultRoute !== newDerivedRoute) {
      user.updateProfile({ defaultRoute: newDerivedRoute });
      await this.users.save(user);
    }

    await this.audit.record({
      action: 'USER_ROLES_REPLACE',
      targetType: 'USER',
      targetId: command.userId,
      before: {
        username: user.username,
        displayName: user.displayName,
        roles: before.map((role) => role.roleCode),
        defaultRoute: beforeDefaultRoute,
      },
      after: {
        username: user.username,
        displayName: user.displayName,
        roles: after.map((role) => role.roleCode),
        defaultRoute: user.defaultRoute,
      },
    });

    // Trả đúng shape của `GET /users` và `/access-control/me` — xem PublicUserRoleDto.
    return after.map((role) => ({ code: role.roleCode, name: role.roleName, dataScope: role.dataScope }));
  }
}
