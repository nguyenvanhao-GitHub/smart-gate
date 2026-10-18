import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { CreateRoleCommand } from '../dto/create-role.command';
import { RoleSummaryDto } from '../dto/access-view.dto';
import { ROLE_REPOSITORY, RoleRepository } from '../ports/role.repository';
import { appBadRequest } from '../../../../common/i18n';

@Injectable()
export class CreateRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly roles: RoleRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: CreateRoleCommand): Promise<RoleSummaryDto> {
    const code = command.code.trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,64}$/.test(code)) {
      throw appBadRequest('role.codeInvalid');
    }
    if (await this.roles.findByCode(code)) throw appBadRequest('role.codeDuplicated');

    const role = await this.roles.create({ code, name: command.name.trim(), description: command.description ?? null });
    await this.audit.record({
      action: 'ROLE_CREATE',
      targetType: 'ROLE',
      targetId: role.id,
      after: { code: role.code, name: role.name, description: role.description },
    });

    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isActive: role.isActive,
      userCount: 0,
    };
  }
}
