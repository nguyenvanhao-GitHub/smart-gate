import { ConflictException, NotFoundException } from '@nestjs/common';
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
import { PublicUserDto, toPublicUser } from '../dto/public-user.dto';
import { UserRepository, UserSearchCriteria } from '../ports/user.repository';
import { UserViewAssembler } from '../services/user-view.assembler';
import { ApproveUserUseCase } from './approve-user.use-case';

class FakeUserRepository implements UserRepository {
  readonly users: UserAccount[] = [];
  saveCount = 0;

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
    this.saveCount += 1;
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

class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];

  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

/** Kho vai trò giả — chỉ hiện thực listRoles/replaceRoles mà use-case dùng, còn lại ném để lộ dùng sai. */
class FakeUserAccessRepository implements UserAccessRepository {
  readonly grants = new Map<string, UserRoleGrant[]>();
  replaceCount = 0;

  constructor(seed: Record<string, UserRoleGrant[]> = {}) {
    for (const [userId, roles] of Object.entries(seed)) this.grants.set(userId, roles);
  }

  async listRoles(userId: string): Promise<UserRoleGrant[]> {
    return this.grants.get(userId) ?? [];
  }

  async replaceRoles(userId: string, inputs: UserRoleGrantInput[]): Promise<UserRoleGrant[]> {
    this.replaceCount += 1;
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

/** Assembler giả — trả thẳng hình chiếu công khai, không truy vấn vai trò/đơn vị. */
class StubAssembler {
  async assemble(user: UserAccount): Promise<PublicUserDto> {
    return toPublicUser(user);
  }
}

function makeUser(status: UserStatus, accountType: AccountType | null = null): UserAccount {
  return UserAccount.create({
    username: 'cho.duyet',
    passwordHash: 'scrypt$16384$8$1$aa$bb',
    displayName: 'Tài khoản chờ',
    title: '',
    defaultRoute: '/declarations',
    email: 'cho@example.com',
    phone: '0911111111',
    status,
    accountType,
  });
}

/** F00 — Duyệt tài khoản tự đăng ký: chỉ PENDING mới lên ACTIVE, còn lại bị chặn. */
describe('ApproveUserUseCase', () => {
  function build(seed: UserAccount[] = [], roleSeed: Record<string, UserRoleGrant[]> = {}) {
    const users = new FakeUserRepository(seed);
    const userAccess = new FakeUserAccessRepository(roleSeed);
    const audit = new RecordingAudit();
    const useCase = new ApproveUserUseCase(
      users,
      userAccess,
      new StubAssembler() as unknown as UserViewAssembler,
      audit,
    );
    return { users, userAccess, audit, useCase };
  }

  it('duyệt tài khoản PENDING → ACTIVE và ghi nhật ký USER_APPROVE kèm before/after', async () => {
    // Tài khoản nội bộ (accountType null) → không tự gán vai trò, grantedRole = null.
    const user = makeUser(UserStatus.PENDING);
    const { users, userAccess, audit, useCase } = build([user]);

    const result = await useCase.execute(user.id);

    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(users.users[0].status).toBe(UserStatus.ACTIVE);
    expect(userAccess.replaceCount).toBe(0);

    const entry = audit.entries.find((item) => item.action === 'USER_APPROVE');
    expect(entry).toBeDefined();
    expect(entry?.targetType).toBe('USER');
    expect(entry?.targetId).toBe(user.id);
    expect(entry?.before).toEqual({ status: UserStatus.PENDING });
    expect(entry?.after).toEqual({ status: UserStatus.ACTIVE, grantedRole: null });
  });

  it('duyệt tài khoản DOANH NGHIỆP chưa có vai trò → ACTIVE + gán ENTERPRISE (dataScope OWN)', async () => {
    const user = makeUser(UserStatus.PENDING, AccountType.ENTERPRISE);
    const { userAccess, audit, useCase } = build([user]);

    await useCase.execute(user.id);

    const roles = await userAccess.listRoles(user.id);
    expect(roles).toHaveLength(1);
    expect(roles[0].roleCode).toBe('ENTERPRISE');
    expect(roles[0].dataScope).toBe(DataScopeLevel.OWN);

    const entry = audit.entries.find((item) => item.action === 'USER_APPROVE');
    expect(entry?.after).toEqual({ status: UserStatus.ACTIVE, grantedRole: 'ENTERPRISE' });
  });

  it('duyệt tài khoản CÁ NHÂN cũ chưa có vai trò → ACTIVE + gán INDIVIDUAL (dataScope OWN)', async () => {
    const user = makeUser(UserStatus.PENDING, AccountType.INDIVIDUAL);
    const { userAccess, useCase } = build([user]);

    await useCase.execute(user.id);

    const roles = await userAccess.listRoles(user.id);
    expect(roles).toHaveLength(1);
    expect(roles[0].roleCode).toBe('INDIVIDUAL');
    expect(roles[0].dataScope).toBe(DataScopeLevel.OWN);
  });

  it('tài khoản DN từng bị gán sai vai trò trước khi duyệt → sửa về ENTERPRISE (OWN)', async () => {
    const user = makeUser(UserStatus.PENDING, AccountType.ENTERPRISE);
    const existing: UserRoleGrant[] = [
      {
        roleCode: 'CUSTOMS_B1',
        roleName: 'Hải quan B1',
        dataScope: DataScopeLevel.ORGANIZATION,
        organizationId: null,
        organizationCode: null,
      },
    ];
    const { userAccess, audit, useCase } = build([user], { [user.id]: existing });

    await useCase.execute(user.id);

    expect(userAccess.replaceCount).toBe(1);
    const roles = await userAccess.listRoles(user.id);
    expect(roles[0]).toMatchObject({ roleCode: 'ENTERPRISE', dataScope: DataScopeLevel.OWN });

    const entry = audit.entries.find((item) => item.action === 'USER_APPROVE');
    expect(entry?.after).toEqual({ status: UserStatus.ACTIVE, grantedRole: 'ENTERPRISE' });
  });

  it('tài khoản ACTIVE (không chờ duyệt) → 409 user.notPending, không ghi và không lưu', async () => {
    const user = makeUser(UserStatus.ACTIVE);
    const { users, audit, useCase } = build([user]);

    let key: string | undefined;
    await useCase.execute(user.id).catch((error: ConflictException) => {
      expect(error).toBeInstanceOf(ConflictException);
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('user.notPending');
    expect(users.saveCount).toBe(0);
    expect(audit.entries).toHaveLength(0);
    expect(users.users[0].status).toBe(UserStatus.ACTIVE);
  });

  it('tài khoản LOCKED → 409 user.notPending (không lẫn với mở khóa)', async () => {
    const user = makeUser(UserStatus.LOCKED);
    const { useCase } = build([user]);

    let key: string | undefined;
    await useCase.execute(user.id).catch((error: ConflictException) => {
      expect(error).toBeInstanceOf(ConflictException);
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('user.notPending');
  });

  it('tài khoản không tồn tại → 404 user.notFound', async () => {
    const { useCase } = build();

    let key: string | undefined;
    await useCase.execute('khong-ton-tai').catch((error: NotFoundException) => {
      expect(error).toBeInstanceOf(NotFoundException);
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('user.notFound');
  });
});
