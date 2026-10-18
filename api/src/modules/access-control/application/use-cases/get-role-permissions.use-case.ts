import { Inject, Injectable } from '@nestjs/common';
import { ROLE_REPOSITORY, RoleRepository } from '../ports/role.repository';
import { appNotFound } from '../../../../common/i18n';

@Injectable()
export class GetRolePermissionsUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly roles: RoleRepository,
  ) {}

  async execute(roleId: string): Promise<string[]> {
    const role = await this.roles.findById(roleId);
    if (!role) throw appNotFound('role.notFound');
    return role.permissions;
  }
}
