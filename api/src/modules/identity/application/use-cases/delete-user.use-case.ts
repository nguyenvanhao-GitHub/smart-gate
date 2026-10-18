import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import {
  USER_ACCESS_REPOSITORY,
  UserAccessRepository,
} from '../../../access-control/application/ports/user-access.repository';
import { toPublicUser } from '../dto/public-user.dto';
import { USER_REPOSITORY, UserRepository } from '../ports/user.repository';
import { appBadRequest, appNotFound } from '../../../../common/i18n';

@Injectable()
export class DeleteUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(USER_ACCESS_REPOSITORY)
    private readonly userAccess: UserAccessRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(userId: string, actorId: string): Promise<{ deleted: true }> {
    const user = await this.users.findById(userId);
    if (!user) throw appNotFound('user.notFound');
    if (user.id === actorId) throw appBadRequest('user.cannotDeleteSelf');

    const roles = await this.userAccess.listRoles(userId);
    const assignments = await this.userAccess.listAssignments(userId);
    // Dọn `user_roles` + `user_assignments` trước: nếu bỏ sót, `userCount` của vai trò sẽ đếm cả
    // tài khoản đã xóa và vai trò đó vĩnh viễn không xóa được trên UI-13.
    await this.userAccess.replaceRoles(userId, []);
    await this.userAccess.replaceAssignments(userId, []);
    await this.users.delete(userId);

    await this.audit.record({
      action: 'USER_DELETE',
      targetType: 'USER',
      targetId: userId,
      before: { ...toPublicUser(user), roles, assignments },
    });
    return { deleted: true };
  }
}
