import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { appBadRequest, appNotFound } from '../../../../common/i18n';
import { RoleSummaryDto } from '../dto/access-view.dto';
import { ROLE_REPOSITORY, RoleRepository } from '../ports/role.repository';

/**
 * Khóa / mở khóa vai trò (F03). Khóa = đặt `roles.is_active = false`; khi đó bộ giải quyết quyền
 * runtime tự bỏ vai trò bị khóa nên quyền của mọi người đang giữ vai trò đó bị treo ngay.
 *
 * Vai trò hệ thống **không được khóa** (tránh tự khóa admin) — mở khóa thì luôn an toàn.
 */
@Injectable()
export class SetRoleActiveUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly roles: RoleRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(roleId: string, active: boolean): Promise<RoleSummaryDto> {
    const current = await this.roles.findById(roleId);
    if (!current) throw appNotFound('role.notFound');
    if (!active && current.isSystem) throw appBadRequest('role.systemCannotLock');

    const updated = await this.roles.setActive(roleId, active);
    const userCounts = await this.roles.countUsersByRole();

    await this.audit.record({
      action: active ? 'ROLE_UNLOCK' : 'ROLE_LOCK',
      targetType: 'ROLE',
      targetId: updated.id,
      before: { name: current.name, code: current.code, isActive: current.isActive },
      after: { name: updated.name, code: updated.code, isActive: updated.isActive },
    });

    return {
      id: updated.id,
      code: updated.code,
      name: updated.name,
      description: updated.description,
      isSystem: updated.isSystem,
      isActive: updated.isActive,
      userCount: userCounts[updated.id] || 0,
    };
  }
}
