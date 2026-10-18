import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { ROLE_REPOSITORY, RoleRepository } from '../ports/role.repository';
import { appBadRequest, appNotFound } from '../../../../common/i18n';

@Injectable()
export class DeleteRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly roles: RoleRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(roleId: string): Promise<{ deleted: true }> {
    const role = await this.roles.findById(roleId);
    if (!role) throw appNotFound('role.notFound');
    if (role.isSystem) throw appBadRequest('role.systemImmutable');

    const userCounts = await this.roles.countUsersByRole();
    const userCount = userCounts[role.id] || 0;
    if (userCount > 0) {
      throw appBadRequest('role.inUse', { count: userCount });
    }

    await this.roles.delete(roleId);
    await this.audit.record({
      action: 'ROLE_DELETE',
      targetType: 'ROLE',
      targetId: roleId,
      before: { code: role.code, name: role.name, permissions: role.permissions },
    });
    return { deleted: true };
  }
}
