import { Inject, Injectable } from '@nestjs/common';
import { RoleSummaryDto } from '../dto/access-view.dto';
import { ROLE_REPOSITORY, RoleRepository } from '../ports/role.repository';

@Injectable()
export class ListRolesUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly roles: RoleRepository,
  ) {}

  async execute(): Promise<RoleSummaryDto[]> {
    const [roles, userCounts] = await Promise.all([this.roles.findAll(), this.roles.countUsersByRole()]);
    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isActive: role.isActive,
      userCount: userCounts[role.id] || 0,
    }));
  }
}
