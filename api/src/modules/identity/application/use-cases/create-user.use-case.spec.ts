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
import { AccountType, UserAccount, UserStatus } from '../../domain/user.entity';
import { CreateUserCommand } from '../dto/create-user.command';
import { PublicUserDto, toPublicUser } from '../dto/public-user.dto';
import { UserRepository, UserSearchCriteria } from '../ports/user.repository';
import { PasswordService } from '../services/password.service';
import { UserViewAssembler } from '../services/user-view.assembler';
import { CreateUserUseCase } from './create-user.use-case';

class FakeUserRepository implements UserRepository {
  readonly users: UserAccount[] = [];

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
    const index = this.users.findIndex((item) => item.id === user.id);
    if (index >= 0) this.users[index] = user;
    else this.users.push(user);
    return user;
  }
  async delete(id: string): Promise<void> {
    const index = this.users.findIndex((item) => item.id === id);
    if (index >= 0) this.users.splice(index, 1);
  }
}

class FakeUserAccessRepository implements UserAccessRepository {
  readonly grants = new Map<string, UserRoleGrant[]>();
  readonly replaceCalls: { userId: string; grants: UserRoleGrantInput[] }[] = [];

  async listRoles(userId: string): Promise<UserRoleGrant[]> {
    return this.grants.get(userId) ?? [];
  }
  async replaceRoles(userId: string, inputs: UserRoleGrantInput[]): Promise<UserRoleGrant[]> {
    this.replaceCalls.push({ userId, grants: inputs });
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

/** Assembler giả — gắn vai trò đọc từ kho access để hình chiếu phản ánh đúng vai trò đã ép. */
class StubAssembler {
  constructor(private readonly access: FakeUserAccessRepository) {}
  async assemble(user: UserAccount): Promise<PublicUserDto> {
    const roles = await this.access.listRoles(user.id);
    return {
      ...toPublicUser(user),
      roles: roles.map((role) => ({ code: role.roleCode, name: role.roleName, dataScope: role.dataScope })),
    };
  }
}

function baseCommand(overrides: Partial<CreateUserCommand> = {}): CreateUserCommand {
  return {
    username: 'nguoi.dung',
    password: 'MatKhau@123',
    displayName: 'Người dùng',
    title: '',
    ...overrides,
  };
}

describe('CreateUserUseCase', () => {
  function build() {
    const users = new FakeUserRepository();
    const userAccess = new FakeUserAccessRepository();
    const audit = new RecordingAudit();
    const useCase = new CreateUserUseCase(
      users,
      userAccess,
      new PasswordService(),
      new StubAssembler(userAccess) as unknown as UserViewAssembler,
      audit,
    );
    return { users, userAccess, audit, useCase };
  }

  it('tạo tài khoản DOANH NGHIỆP → tự gán vai trò ENTERPRISE (OWN)', async () => {
    const { users, userAccess, useCase } = build();

    const view = await useCase.execute(
      baseCommand({
        username: 'cong.ty.a',
        accountType: AccountType.ENTERPRISE,
        taxCode: '0101234567',
        representativeName: 'Nguyễn Văn A',
        address: 'Hà Nội',
      }),
    );

    const saved = users.users[0];
    expect(saved.status).toBe(UserStatus.ACTIVE);
    const roles = await userAccess.listRoles(saved.id);
    expect(roles).toHaveLength(1);
    expect(roles[0].roleCode).toBe('ENTERPRISE');
    expect(roles[0].dataScope).toBe(DataScopeLevel.OWN);
    // defaultRoute suy từ vai trò đã ép → màn hồ sơ.
    expect(saved.defaultRoute).toBe('/declarations');
    expect(view.roles.map((role) => role.code)).toEqual(['ENTERPRISE']);
  });

  it('tạo tài khoản CÁ NHÂN → tự gán vai trò INDIVIDUAL (OWN)', async () => {
    const { users, userAccess, useCase } = build();

    await useCase.execute(
      baseCommand({
        username: 'ca.nhan.b',
        accountType: AccountType.INDIVIDUAL,
        idNumber: '012345678901',
        address: 'Lào Cai',
      }),
    );

    const roles = await userAccess.listRoles(users.users[0].id);
    expect(roles).toHaveLength(1);
    expect(roles[0].roleCode).toBe('INDIVIDUAL');
    expect(roles[0].dataScope).toBe(DataScopeLevel.OWN);
  });

  it('tạo tài khoản NỘI BỘ (accountType rỗng) → chưa có vai trò, chờ luồng gán riêng', async () => {
    const { users, userAccess, useCase } = build();

    await useCase.execute(
      baseCommand({
        username: 'can.bo.hq',
      }),
    );

    const roles = await userAccess.listRoles(users.users[0].id);
    expect(roles).toEqual([]);
  });

  it('trùng username khi tạo tài khoản → bắn ConflictException với auth.registerDuplicateUsername', async () => {
    const { users, useCase } = build();
    users.users.push(
      UserAccount.create({
        username: 'can.bo.hq',
        passwordHash: 'hash',
        displayName: 'Cán bộ',
        title: '',
        defaultRoute: '/',
      }),
    );

    let key: string | undefined;
    await useCase
      .execute(baseCommand({ username: 'can.bo.hq' }))
      .catch((err: any) => {
        key = err.getResponse?.()?.errors?.[0]?.messageKey;
      });

    expect(key).toBe('auth.registerDuplicateUsername');
  });

  it('trùng email khi tạo tài khoản → bắn ConflictException với auth.registerDuplicateEmail', async () => {
    const { users, useCase } = build();
    users.users.push(
      UserAccount.create({
        username: 'can.bo.a',
        passwordHash: 'hash',
        displayName: 'Cán bộ A',
        title: '',
        defaultRoute: '/',
        email: 'qnhuy213@gmail.com',
      }),
    );

    let key: string | undefined;
    await useCase
      .execute(baseCommand({ username: 'can.bo.b', email: 'qnhuy213@gmail.com' }))
      .catch((err: any) => {
        key = err.getResponse?.()?.errors?.[0]?.messageKey;
      });

    expect(key).toBe('auth.registerDuplicateEmail');
  });

  it('trùng nhiều trường cùng lúc -> trả về mảng errors chứa tất cả các lỗi', async () => {
    const { users, useCase } = build();
    users.users.push(
      UserAccount.create({
        username: 'can.bo.a',
        passwordHash: 'hash',
        displayName: 'Cán bộ A',
        title: '',
        defaultRoute: '/',
        email: 'qnhuy213@gmail.com',
        phone: '0987654321',
      }),
    );

    let errors: any[] | undefined;
    await useCase
      .execute(baseCommand({ username: 'can.bo.a', email: 'qnhuy213@gmail.com', phone: '0987654321' }))
      .catch((err: any) => {
        errors = err.getResponse?.()?.errors;
      });

    expect(errors).toBeDefined();
    expect(errors?.length).toBe(3);
    expect(errors?.map((e) => e.field)).toEqual(['username', 'email', 'phone']);
  });
});
