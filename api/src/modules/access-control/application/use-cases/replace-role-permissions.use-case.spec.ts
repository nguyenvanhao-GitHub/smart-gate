import { BadRequestException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { Role } from '../../domain/access-control.entities';
import { SYS_ADMIN_CORE_PERMISSIONS } from '../../domain/role.catalog';
import { CreateRoleInput, RoleRepository, UpdateRoleInput } from '../ports/role.repository';
import { ReplaceRolePermissionsUseCase } from './replace-role-permissions.use-case';

class FakeRoleRepository implements RoleRepository {
  readonly roles: Role[];
  lastReplace?: { code: string; permissions: string[] };

  constructor(roles: Role[]) {
    this.roles = roles;
  }

  async findAll(): Promise<Role[]> {
    return [...this.roles];
  }
  async findById(id: string): Promise<Role | null> {
    return this.roles.find((role) => role.id === id) ?? null;
  }
  async findByCode(code: string): Promise<Role | null> {
    return this.roles.find((role) => role.code === code) ?? null;
  }
  async ensure(): Promise<void> {
    return;
  }
  async replacePermissions(roleCode: string, permissionCodes: string[]): Promise<Role> {
    this.lastReplace = { code: roleCode, permissions: permissionCodes };
    const role = this.roles.find((item) => item.code === roleCode)!;
    role.permissions = permissionCodes;
    return role;
  }
  async create(_input: CreateRoleInput): Promise<Role> {
    throw new Error('không dùng');
  }
  async update(_id: string, _input: UpdateRoleInput): Promise<Role> {
    throw new Error('không dùng');
  }
  async setActive(): Promise<Role> {
    throw new Error('không dùng');
  }
  async delete(): Promise<void> {
    return;
  }
  async countUsersByRole(): Promise<Record<string, number>> {
    return {};
  }
}

class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];
  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

function role(overrides: Partial<Role>): Role {
  return {
    id: 'r1',
    code: 'SYS_ADMIN',
    name: 'Quản trị hệ thống',
    description: null,
    isSystem: true,
    isActive: true,
    permissions: [],
    ...overrides,
  };
}

/** BUG-059 — không cho gỡ bộ quyền quản trị cốt lõi của vai trò SYS_ADMIN (chống tự khóa hệ thống). */
describe('ReplaceRolePermissionsUseCase — chống tự khóa SYS_ADMIN (BUG-059)', () => {
  function build(roles: Role[]) {
    const repo = new FakeRoleRepository(roles);
    const audit = new RecordingAudit();
    return { repo, audit, useCase: new ReplaceRolePermissionsUseCase(repo, audit) };
  }

  it('gỡ sạch quyền của SYS_ADMIN → 400 role.systemAdminCoreRequired, không lưu', async () => {
    const { repo, audit, useCase } = build([role({ id: 'r1', code: 'SYS_ADMIN' })]);

    let key: string | undefined;
    await useCase.execute({ roleId: 'r1', permissions: [] }).catch((error: BadRequestException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('role.systemAdminCoreRequired');
    expect(repo.lastReplace).toBeUndefined();
    expect(audit.entries).toEqual([]);
  });

  it('bỏ chỉ một quyền core (system.update) của SYS_ADMIN → 400, không lưu', async () => {
    const { repo, useCase } = build([role({ id: 'r1', code: 'SYS_ADMIN' })]);
    const withoutUpdate = SYS_ADMIN_CORE_PERMISSIONS.filter((code) => code !== 'system.update');

    await expect(useCase.execute({ roleId: 'r1', permissions: withoutUpdate })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.lastReplace).toBeUndefined();
  });

  it('giữ đủ quyền core của SYS_ADMIN → lưu bình thường và ghi nhật ký', async () => {
    const { repo, audit, useCase } = build([role({ id: 'r1', code: 'SYS_ADMIN' })]);
    const permissions = [...SYS_ADMIN_CORE_PERMISSIONS, 'dossier.view'];

    const result = await useCase.execute({ roleId: 'r1', permissions });

    expect(result).toEqual(permissions);
    expect(repo.lastReplace?.permissions).toEqual(permissions);
    expect(audit.entries.some((entry) => entry.action === 'ROLE_PERMISSIONS_REPLACE')).toBe(true);
  });

  it('vai trò thường được phép gỡ sạch quyền (không áp rào SYS_ADMIN)', async () => {
    const { repo, useCase } = build([role({ id: 'r2', code: 'FEE_COLLECTOR', isSystem: true })]);

    const result = await useCase.execute({ roleId: 'r2', permissions: [] });

    expect(result).toEqual([]);
    expect(repo.lastReplace?.permissions).toEqual([]);
  });
});
