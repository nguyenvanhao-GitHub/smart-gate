import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import {
  CreateRoleInput,
  RoleRepository,
  UpdateRoleInput,
} from '../../application/ports/role.repository';
import { Role } from '../../domain/access-control.entities';
import { RoleDefinition, permissionsForRole } from '../../domain/role.catalog';
import { AccessControlMapper } from './access-control.mapper';
import { PermissionOrmEntity } from './permission.orm-entity';
import { RolePermissionOrmEntity } from './role-permission.orm-entity';
import { RoleOrmEntity } from './role.orm-entity';
import { UserRoleOrmEntity } from './user-role.orm-entity';
import { appBadRequest, appNotFound } from '../../../../common/i18n';

@Injectable()
export class TypeOrmRoleRepository implements RoleRepository {
  constructor(
    @InjectRepository(RoleOrmEntity)
    private readonly roles: Repository<RoleOrmEntity>,
    @InjectRepository(RolePermissionOrmEntity)
    private readonly rolePermissions: Repository<RolePermissionOrmEntity>,
    @InjectRepository(PermissionOrmEntity)
    private readonly permissions: Repository<PermissionOrmEntity>,
    @InjectRepository(UserRoleOrmEntity)
    private readonly userRoles: Repository<UserRoleOrmEntity>,
  ) {}

  async findAll(): Promise<Role[]> {
    const rows = await this.roles.find({ order: { code: 'ASC' } });
    const grants = await this.rolePermissions.find();
    const byRole = new Map<string, string[]>();
    for (const grant of grants) {
      const list = byRole.get(grant.roleId) || [];
      list.push(grant.permissionCode);
      byRole.set(grant.roleId, list);
    }
    return rows.map((row) => AccessControlMapper.toRole(row, (byRole.get(row.id) || []).sort()));
  }

  async findById(id: string): Promise<Role | null> {
    const row = await this.roles.findOne({ where: { id } });
    return row ? this.withPermissions(row) : null;
  }

  async findByCode(code: string): Promise<Role | null> {
    const row = await this.roles.findOne({ where: { code } });
    return row ? this.withPermissions(row) : null;
  }

  /**
   * Seed idempotent: chỉ thêm vai trò còn thiếu. Ma trận quyền được nạp **một lần duy nhất lúc
   * tạo vai trò** — nếu seed lại mỗi lần khởi động thì các ô quản trị viên đã bỏ tick trên UI-13
   * sẽ bị bật lại, tức là ghi đè cấu hình vận hành.
   */
  async ensure(definitions: RoleDefinition[]): Promise<void> {
    const existing = await this.roles.find();
    const byCode = new Map(existing.map((row) => [row.code, row]));
    const permissionIdByCode = await this.permissionIdByCode();

    for (const definition of definitions) {
      if (byCode.has(definition.code)) continue;

      const row = new RoleOrmEntity();
      row.id = randomUUID();
      row.code = definition.code;
      row.name = definition.name;
      row.description = definition.description;
      row.isSystem = definition.isSystem;
      row.isActive = true;
      await this.roles.save(row);

      const grants = permissionsForRole(definition)
        .filter((code) => permissionIdByCode.has(code))
        .map((code) => this.buildGrant(row.id, permissionIdByCode.get(code) as string, code));
      if (grants.length > 0) await this.rolePermissions.save(grants);
    }
  }

  async replacePermissions(roleCode: string, permissionCodes: string[]): Promise<Role> {
    const role = await this.roles.findOne({ where: { code: roleCode } });
    if (!role) throw appNotFound('role.notFoundForPermissions');

    const permissionIdByCode = await this.permissionIdByCode();
    const unknown = permissionCodes.filter((code) => !permissionIdByCode.has(code));
    if (unknown.length > 0) {
      throw appBadRequest('role.permissionUnknown', { codes: unknown.join(', ') });
    }

    await this.rolePermissions.delete({ roleId: role.id });
    const unique = [...new Set(permissionCodes)];
    if (unique.length > 0) {
      await this.rolePermissions.save(
        unique.map((code) => this.buildGrant(role.id, permissionIdByCode.get(code) as string, code)),
      );
    }
    return this.withPermissions(role);
  }

  async create(input: CreateRoleInput): Promise<Role> {
    const row = new RoleOrmEntity();
    row.id = randomUUID();
    row.code = input.code;
    row.name = input.name;
    row.description = input.description ?? null;
    row.isSystem = false;
    row.isActive = true;
    await this.roles.save(row);
    return AccessControlMapper.toRole(row, []);
  }

  async update(id: string, input: UpdateRoleInput): Promise<Role> {
    const row = await this.roles.findOne({ where: { id } });
    if (!row) throw appNotFound('role.notFound');
    if (input.name !== undefined) row.name = input.name;
    if (input.description !== undefined) row.description = input.description;
    await this.roles.save(row);
    return this.withPermissions(row);
  }

  async setActive(id: string, active: boolean): Promise<Role> {
    const row = await this.roles.findOne({ where: { id } });
    if (!row) throw appNotFound('role.notFound');
    row.isActive = active;
    await this.roles.save(row);
    return this.withPermissions(row);
  }

  async delete(id: string): Promise<void> {
    await this.rolePermissions.delete({ roleId: id });
    await this.roles.delete(id);
  }

  async countUsersByRole(): Promise<Record<string, number>> {
    const rows = await this.userRoles
      .createQueryBuilder('userRole')
      .select('userRole.roleId', 'roleId')
      .addSelect('COUNT(*)', 'total')
      .groupBy('userRole.roleId')
      .getRawMany<{ roleId: string; total: string }>();
    return rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.roleId]: Number(row.total) }), {});
  }

  private buildGrant(roleId: string, permissionId: string, permissionCode: string): RolePermissionOrmEntity {
    const grant = new RolePermissionOrmEntity();
    grant.roleId = roleId;
    grant.permissionId = permissionId;
    grant.permissionCode = permissionCode;
    return grant;
  }

  private async withPermissions(row: RoleOrmEntity): Promise<Role> {
    const grants = await this.rolePermissions.find({ where: { roleId: row.id } });
    return AccessControlMapper.toRole(
      row,
      grants.map((grant) => grant.permissionCode).sort(),
    );
  }

  private async permissionIdByCode(): Promise<Map<string, string>> {
    const rows = await this.permissions.find();
    return new Map(rows.map((row) => [row.code, row.id]));
  }
}
