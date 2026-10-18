import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { PaginatedResult } from '../../../../common/http/pagination';
import {
  UserAccessRepository,
  UserRoleGrantInput,
} from '../../../access-control/application/ports/user-access.repository';
import {
  UserAccessSnapshot,
  UserAssignment,
  UserRoleGrant,
} from '../../../access-control/domain/access-control.entities';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { AccountType, UserAccount } from '../../domain/user.entity';
import { UserRepository, UserSearchCriteria } from '../ports/user.repository';
import { ReplaceUserRolesUseCase } from './replace-user-roles.use-case';

class FakeUserRepository implements UserRepository {
  readonly users: UserAccount[] = [];
  constructor(seed: UserAccount[] = []) {
    this.users.push(...seed);
  }
  async count(): Promise<number> {
    return this.users.length;
  }
  async findMany(_criteria: UserSearchCriteria): Promise<PaginatedResult<UserAccount>> {
    return { items: this.users, total: this.users.length, page: 1, pageSize: this.users.length };
  }
  async findById(id: string): Promise<UserAccount | null> {
    return this.users.find((user) => user.id === id) ?? null;
  }
  async findByUsername(username: string): Promise<UserAccount | null> {
    return this.users.find((user) => user.username === username) ?? null;
  }
  async findByEmail(email: string): Promise<UserAccount | null> {
    return this.users.find((user) => user.email === email) ?? null;
  }
  async findByPhone(phone: string): Promise<UserAccount | null> {
    return this.users.find((user) => user.phone === phone) ?? null;
  }
  async findByTaxCode(taxCode: string): Promise<UserAccount | null> {
    return this.users.find((user) => user.taxCode === taxCode) ?? null;
  }
  async findByIdNumber(idNumber: string): Promise<UserAccount | null> {
    return this.users.find((user) => user.idNumber === idNumber) ?? null;
  }
  async save(user: UserAccount): Promise<UserAccount> {
    return user;
  }
  async delete(): Promise<void> {}
}

class FakeUserAccessRepository implements UserAccessRepository {
  readonly grants = new Map<string, UserRoleGrant[]>();
  lastReplace: UserRoleGrantInput[] | null = null;

  async listRoles(userId: string): Promise<UserRoleGrant[]> {
    return this.grants.get(userId) ?? [];
  }
  async replaceRoles(userId: string, inputs: UserRoleGrantInput[]): Promise<UserRoleGrant[]> {
    this.lastReplace = inputs;
    const roles: UserRoleGrant[] = inputs.map((input) => ({
      roleCode: input.roleCode,
      roleName: input.roleCode,
      dataScope: input.dataScope,
      organizationId: null,
      organizationCode: input.organizationCode ?? null,
    }));
    this.grants.set(userId, roles);
    return roles;
  }
  loadSnapshot(): Promise<UserAccessSnapshot> {
    throw new Error('không dùng trong test này');
  }
  listRolesForUsers(): Promise<Record<string, UserRoleGrant[]>> {
    throw new Error('không dùng trong test này');
  }
  listAssignments(): Promise<UserAssignment[]> {
    throw new Error('không dùng trong test này');
  }
  replaceAssignments(): Promise<UserAssignment[]> {
    throw new Error('không dùng trong test này');
  }
  countRoles(): Promise<number> {
    throw new Error('không dùng trong test này');
  }
}

class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];
  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

function makeUser(accountType: AccountType | null, username = 'nguoi.dung', isProtected = false): UserAccount {
  return UserAccount.create({
    username,
    passwordHash: 'scrypt$16384$8$1$aa$bb',
    displayName: 'Người dùng',
    title: '',
    defaultRoute: '/declarations',
    accountType,
    isProtected,
  });
}

describe('ReplaceUserRolesUseCase', () => {
  function build(user: UserAccount) {
    const users = new FakeUserRepository([user]);
    const userAccess = new FakeUserAccessRepository();
    const audit = new RecordingAudit();
    const useCase = new ReplaceUserRolesUseCase(users, userAccess, audit);
    return { userAccess, audit, useCase };
  }

  it('tài khoản NỘI BỘ → gán đúng vai trò admin chọn', async () => {
    const user = makeUser(null);
    const { userAccess, useCase } = build(user);

    const result = await useCase.execute({
      userId: user.id,
      roles: [{ roleCode: 'CUSTOMS_B1', dataScope: DataScopeLevel.ORGANIZATION }],
    });

    expect(userAccess.lastReplace).toEqual([
      { roleCode: 'CUSTOMS_B1', dataScope: DataScopeLevel.ORGANIZATION },
    ]);
    expect(result.map((role) => role.code)).toEqual(['CUSTOMS_B1']);
  });

  it('tài khoản DOANH NGHIỆP → ép ENTERPRISE (OWN), bỏ qua vai trò admin gửi', async () => {
    const user = makeUser(AccountType.ENTERPRISE);
    const { userAccess, useCase } = build(user);

    const result = await useCase.execute({
      userId: user.id,
      roles: [{ roleCode: 'CUSTOMS_B1', dataScope: DataScopeLevel.ORGANIZATION }],
    });

    expect(userAccess.lastReplace).toEqual([{ roleCode: 'ENTERPRISE', dataScope: DataScopeLevel.OWN }]);
    expect(result.map((role) => role.code)).toEqual(['ENTERPRISE']);
    expect(result[0].dataScope).toBe(DataScopeLevel.OWN);
  });

  it('tài khoản CÁ NHÂN → ép INDIVIDUAL (OWN)', async () => {
    const user = makeUser(AccountType.INDIVIDUAL);
    const { userAccess, useCase } = build(user);

    await useCase.execute({
      userId: user.id,
      roles: [{ roleCode: 'FEE_COLLECTOR', dataScope: DataScopeLevel.ALL }],
    });

    expect(userAccess.lastReplace).toEqual([{ roleCode: 'INDIVIDUAL', dataScope: DataScopeLevel.OWN }]);
  });

  it('tài khoản có cờ isProtected = true → luôn bảo toàn vai trò SYS_ADMIN khi gán lại', async () => {
    const user = makeUser(null, 'admin', true);
    const { userAccess, useCase } = build(user);
    userAccess.grants.set(user.id, [
      { roleCode: 'SYS_ADMIN', roleName: 'Quản trị hệ thống', dataScope: DataScopeLevel.ALL, organizationId: null, organizationCode: null },
    ]);

    const result = await useCase.execute({
      userId: user.id,
      roles: [{ roleCode: 'CUSTOMS_B1', dataScope: DataScopeLevel.ORGANIZATION }],
    });

    expect(userAccess.lastReplace).toEqual([
      { roleCode: 'CUSTOMS_B1', dataScope: DataScopeLevel.ORGANIZATION },
      { roleCode: 'SYS_ADMIN', dataScope: DataScopeLevel.ALL },
    ]);
    expect(result.map((role) => role.code)).toContain('SYS_ADMIN');
  });

  it('tài khoản không có cờ isProtected (isProtected = false) → cho phép bỏ vai trò SYS_ADMIN khi gán lại', async () => {
    const user = makeUser(null, 'canbo.admin', false);
    const { userAccess, useCase } = build(user);
    userAccess.grants.set(user.id, [
      { roleCode: 'SYS_ADMIN', roleName: 'Quản trị hệ thống', dataScope: DataScopeLevel.ALL, organizationId: null, organizationCode: null },
    ]);

    const result = await useCase.execute({
      userId: user.id,
      roles: [{ roleCode: 'CUSTOMS_B1', dataScope: DataScopeLevel.ORGANIZATION }],
    });

    expect(userAccess.lastReplace).toEqual([
      { roleCode: 'CUSTOMS_B1', dataScope: DataScopeLevel.ORGANIZATION },
    ]);
    expect(result.map((role) => role.code)).toEqual(['CUSTOMS_B1']);
  });

  it('tự động đồng bộ defaultRoute theo vai trò mới khi route trước đó là route tự suy', async () => {
    const user = makeUser(null, 'dieu.phoi', false);
    user.defaultRoute = '/workflow/queue';
    const { userAccess, audit, useCase } = build(user);
    userAccess.grants.set(user.id, [
      { roleCode: 'CUSTOMS', roleName: 'Hải quan', dataScope: DataScopeLevel.ALL, organizationId: null, organizationCode: null },
    ]);

    await useCase.execute({
      userId: user.id,
      roles: [{ roleCode: 'DISPATCHER', dataScope: DataScopeLevel.ALL }],
    });

    expect(user.defaultRoute).toBe('/operations/vehicle-confirmation');
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'USER_ROLES_REPLACE',
      targetType: 'USER',
      targetId: user.id,
      before: {
        username: 'dieu.phoi',
        roles: ['CUSTOMS'],
        defaultRoute: '/workflow/queue',
      },
      after: {
        username: 'dieu.phoi',
        roles: ['DISPATCHER'],
        defaultRoute: '/operations/vehicle-confirmation',
      },
    });
  });

  it('bảo toàn defaultRoute đặt tay (manual route) khi admin đã chỉnh sửa riêng', async () => {
    const user = makeUser(null, 'canbo.tuybien', false);
    user.defaultRoute = '/admin/audit'; // Admin đã đặt tay màn nhật ký
    const { userAccess, audit, useCase } = build(user);
    userAccess.grants.set(user.id, [
      { roleCode: 'CUSTOMS', roleName: 'Hải quan', dataScope: DataScopeLevel.ALL, organizationId: null, organizationCode: null },
    ]);

    await useCase.execute({
      userId: user.id,
      roles: [{ roleCode: 'DISPATCHER', dataScope: DataScopeLevel.ALL }],
    });

    // Giữ nguyên route đặt tay /admin/audit, không bị reset về /operations/vehicle-confirmation
    expect(user.defaultRoute).toBe('/admin/audit');
    expect((audit.entries[0].before as Record<string, unknown>)['defaultRoute']).toBe('/admin/audit');
    expect((audit.entries[0].after as Record<string, unknown>)['defaultRoute']).toBe('/admin/audit');
  });
});
