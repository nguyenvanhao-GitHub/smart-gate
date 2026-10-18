import { Inject, Injectable } from '@nestjs/common';
import {
  ORGANIZATION_REPOSITORY,
  OrganizationRepository,
} from '../../../access-control/application/ports/organization.repository';
import {
  USER_ACCESS_REPOSITORY,
  UserAccessRepository,
} from '../../../access-control/application/ports/user-access.repository';
import { UserAccount } from '../../domain/user.entity';
import { PublicUserDto, toPublicUser } from '../dto/public-user.dto';

/**
 * Bổ sung `organization` và `roles` (RBAC) vào hình chiếu tài khoản — hai cột bắt buộc của UI-13.
 * Nạp theo lô: 1 truy vấn vai trò cho cả trang + 1 lần đọc bảng đơn vị, không gọi lặp theo từng dòng.
 */
@Injectable()
export class UserViewAssembler {
  constructor(
    @Inject(USER_ACCESS_REPOSITORY)
    private readonly userAccess: UserAccessRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
  ) {}

  async assemble(user: UserAccount): Promise<PublicUserDto> {
    const [view] = await this.assembleMany([user]);
    return view;
  }

  async assembleMany(users: UserAccount[]): Promise<PublicUserDto[]> {
    if (users.length === 0) return [];

    const rolesByUser = await this.userAccess.listRolesForUsers(users.map((user) => user.id));
    const organizations = await this.organizations.findAll();
    const organizationById = new Map(organizations.map((item) => [item.id, item]));

    return users.map((user) => {
      const organization = user.organizationId ? organizationById.get(user.organizationId) : undefined;
      return {
        ...toPublicUser(user),
        organization: organization ? { id: organization.id, code: organization.code, name: organization.name } : null,
        roles: (rolesByUser[user.id] || []).map((grant) => ({
          code: grant.roleCode,
          name: grant.roleName,
          dataScope: grant.dataScope,
        })),
      };
    });
  }
}
