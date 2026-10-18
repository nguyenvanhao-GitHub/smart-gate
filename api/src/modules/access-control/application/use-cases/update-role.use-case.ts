import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { RoleSummaryDto } from '../dto/access-view.dto';
import { UpdateRoleCommand } from '../dto/update-role.command';
import { ROLE_REPOSITORY, RoleRepository } from '../ports/role.repository';
import { appNotFound } from '../../../../common/i18n';

@Injectable()
export class UpdateRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly roles: RoleRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: UpdateRoleCommand): Promise<RoleSummaryDto> {
    const current = await this.roles.findById(command.roleId);
    if (!current) throw appNotFound('role.notFound');

    const updated = await this.roles.update(command.roleId, {
      name: command.name?.trim(),
      description: command.description,
    });
    const userCounts = await this.roles.countUsersByRole();

    await this.audit.record({
      action: 'ROLE_UPDATE',
      targetType: 'ROLE',
      targetId: updated.id,
      before: { name: current.name, description: current.description },
      after: { name: updated.name, description: updated.description },
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
