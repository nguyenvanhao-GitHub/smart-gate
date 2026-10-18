import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import {
  UserAccessRepository,
  UserAssignmentInput,
  UserRoleGrantInput,
} from '../../application/ports/user-access.repository';
import { UserAccessSnapshot, UserAssignment, UserRoleGrant } from '../../domain/access-control.entities';
import { OrganizationOrmEntity } from './organization.orm-entity';
import { RolePermissionOrmEntity } from './role-permission.orm-entity';
import { RoleOrmEntity } from './role.orm-entity';
import { UserAssignmentOrmEntity } from './user-assignment.orm-entity';
import { UserRoleOrmEntity } from './user-role.orm-entity';
import { appBadRequest } from '../../../../common/i18n';

@Injectable()
export class TypeOrmUserAccessRepository implements UserAccessRepository {
  constructor(
    @InjectRepository(UserRoleOrmEntity)
    private readonly userRoles: Repository<UserRoleOrmEntity>,
    @InjectRepository(UserAssignmentOrmEntity)
    private readonly userAssignments: Repository<UserAssignmentOrmEntity>,
    @InjectRepository(RoleOrmEntity)
    private readonly roles: Repository<RoleOrmEntity>,
    @InjectRepository(RolePermissionOrmEntity)
    private readonly rolePermissions: Repository<RolePermissionOrmEntity>,
    @InjectRepository(OrganizationOrmEntity)
    private readonly organizations: Repository<OrganizationOrmEntity>,
  ) {}

  async loadSnapshot(userId: string): Promise<UserAccessSnapshot> {
    const grants = await this.userRoles.find({ where: { userId } });
    const roleIds = grants.map((grant) => grant.roleId);
    const roles = await this.listRoles(userId, grants);
    const permissions =
      roleIds.length === 0
        ? []
        : [
            ...new Set(
              (await this.rolePermissions.find({ where: { roleId: In(roleIds) } })).map((row) => row.permissionCode),
            ),
          ].sort();

    return { userId, roles, permissions, assignments: await this.listAssignments(userId) };
  }

  async listRoles(userId: string, preloaded?: UserRoleOrmEntity[]): Promise<UserRoleGrant[]> {
    const grants = preloaded ?? (await this.userRoles.find({ where: { userId } }));
    if (grants.length === 0) return [];
    return this.mapGrants(grants, await this.roleContext(grants));
  }

  async listRolesForUsers(userIds: string[]): Promise<Record<string, UserRoleGrant[]>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return {};

    const grants = await this.userRoles.find({ where: { userId: In(unique) } });
    if (grants.length === 0) return {};

    const context = await this.roleContext(grants);
    return grants.reduce<Record<string, UserRoleGrant[]>>((acc, grant) => {
      const [mapped] = this.mapGrants([grant], context);
      if (!mapped) return acc;
      return { ...acc, [grant.userId]: [...(acc[grant.userId] || []), mapped] };
    }, {});
  }

  async listAssignments(userId: string): Promise<UserAssignment[]> {
    const rows = await this.userAssignments.find({ where: { userId, isActive: true } });
    return rows.map((row) => ({
      type: row.type,
      value: row.value,
      label: row.label,
      organizationId: row.organizationId,
    }));
  }

  async replaceRoles(userId: string, grants: UserRoleGrantInput[]): Promise<UserRoleGrant[]> {
    const codes = [...new Set(grants.map((grant) => grant.roleCode))];
    const roles = codes.length > 0 ? await this.roles.find({ where: { code: In(codes) } }) : [];
    const roleIdByCode = new Map(roles.map((role) => [role.code, role.id]));
    const unknown = codes.filter((code) => !roleIdByCode.has(code));
    if (unknown.length > 0) throw appBadRequest('role.unknownRoles', { codes: unknown.join(', ') });

    const organizationIdByCode = await this.organizationIdByCode(
      grants.map((grant) => grant.organizationCode).filter((code): code is string => !!code),
    );

    await this.userRoles.delete({ userId });
    const rows = grants.map((grant) => {
      const row = new UserRoleOrmEntity();
      row.id = randomUUID();
      row.userId = userId;
      row.roleId = roleIdByCode.get(grant.roleCode) as string;
      row.dataScope = grant.dataScope;
      row.organizationId = grant.organizationCode ? organizationIdByCode.get(grant.organizationCode) ?? null : null;
      return row;
    });
    if (rows.length > 0) await this.userRoles.save(rows);
    return this.listRoles(userId);
  }

  async replaceAssignments(userId: string, assignments: UserAssignmentInput[]): Promise<UserAssignment[]> {
    const organizationIdByCode = await this.organizationIdByCode(
      assignments.map((item) => item.organizationCode).filter((code): code is string => !!code),
    );

    await this.userAssignments.delete({ userId });
    const rows = assignments.map((item) => {
      const row = new UserAssignmentOrmEntity();
      row.id = randomUUID();
      row.userId = userId;
      row.type = item.type;
      row.value = item.value;
      row.label = item.label ?? null;
      row.organizationId = item.organizationCode ? organizationIdByCode.get(item.organizationCode) ?? null : null;
      row.isActive = true;
      return row;
    });
    if (rows.length > 0) await this.userAssignments.save(rows);
    return this.listAssignments(userId);
  }

  countRoles(userId: string): Promise<number> {
    return this.userRoles.count({ where: { userId } });
  }

  /** Nạp sẵn vai trò + mã đơn vị cho một tập bản ghi `user_roles` (dùng chung cho 1 hay nhiều người dùng). */
  private async roleContext(grants: UserRoleOrmEntity[]): Promise<{
    roleById: Map<string, RoleOrmEntity>;
    organizationCodeById: Map<string, string>;
  }> {
    const roles = await this.roles.find({ where: { id: In([...new Set(grants.map((grant) => grant.roleId))]) } });
    return {
      roleById: new Map(roles.map((role) => [role.id, role])),
      organizationCodeById: await this.organizationCodeById(
        grants.map((grant) => grant.organizationId).filter((id): id is string => !!id),
      ),
    };
  }

  private mapGrants(
    grants: UserRoleOrmEntity[],
    context: { roleById: Map<string, RoleOrmEntity>; organizationCodeById: Map<string, string> },
  ): UserRoleGrant[] {
    return grants
      .filter((grant) => context.roleById.get(grant.roleId)?.isActive)
      .map((grant) => ({
        roleCode: context.roleById.get(grant.roleId)?.code as string,
        roleName: context.roleById.get(grant.roleId)?.name as string,
        dataScope: grant.dataScope,
        organizationId: grant.organizationId,
        organizationCode: grant.organizationId
          ? context.organizationCodeById.get(grant.organizationId) ?? null
          : null,
      }));
  }

  private async organizationCodeById(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.organizations.find({ where: { id: In([...new Set(ids)]) } });
    return new Map(rows.map((row) => [row.id, row.code]));
  }

  private async organizationIdByCode(codes: string[]): Promise<Map<string, string>> {
    if (codes.length === 0) return new Map();
    const rows = await this.organizations.find({ where: { code: In([...new Set(codes)]) } });
    return new Map(rows.map((row) => [row.code, row.id]));
  }
}
