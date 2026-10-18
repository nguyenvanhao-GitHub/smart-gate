import { NotFoundException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { PaginatedResult } from '../../../../common/http/pagination';
import { Organization } from '../../../access-control/domain/access-control.entities';
import { OrganizationRepository } from '../../../access-control/application/ports/organization.repository';
import {
  UserAccessRepository,
  UserAssignmentInput,
  UserRoleGrantInput,
} from '../../../access-control/application/ports/user-access.repository';
import { UserAccessSnapshot, UserAssignment, UserRoleGrant } from '../../../access-control/domain/access-control.entities';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { AccountType, UserAccount } from '../../domain/user.entity';
import { UserRepository, UserSearchCriteria } from '../ports/user.repository';
import { PasswordService } from '../services/password.service';
import { UserViewAssembler } from '../services/user-view.assembler';
import { CreateUserUseCase } from './create-user.use-case';
import { UpdateProfileUseCase } from './update-profile.use-case';
import { UpdateUserUseCase } from './update-user.use-case';

/**
 * F01 / F00 — chuẩn hóa nhóm trường định danh theo loại tài khoản (không ghi lẫn giữa các loại), và
 * hồ sơ cá nhân (F01) ghi được địa chỉ. Bổ sung khoảng trống của LÔ 6.
 */

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
  readonly rolesByUser = new Map<string, UserRoleGrantInput[]>();
  async loadSnapshot(_userId: string): Promise<UserAccessSnapshot> {
    return { permissions: [], roles: [], assignments: [] } as unknown as UserAccessSnapshot;
  }
  async listRoles(_userId: string): Promise<UserRoleGrant[]> {
    return [];
  }
  async listRolesForUsers(_userIds: string[]): Promise<Record<string, UserRoleGrant[]>> {
    return {};
  }
  async listAssignments(_userId: string): Promise<UserAssignment[]> {
    return [];
  }
  async replaceRoles(userId: string, grants: UserRoleGrantInput[]): Promise<UserRoleGrant[]> {
    this.rolesByUser.set(userId, grants);
    return [];
  }
  async replaceAssignments(_userId: string, _assignments: UserAssignmentInput[]): Promise<UserAssignment[]> {
    return [];
  }
  async countRoles(_userId: string): Promise<number> {
    return 0;
  }
}

class FakeOrganizationRepository implements OrganizationRepository {
  async findAll(): Promise<Organization[]> {
    return [];
  }
  async findByCode(_code: string): Promise<Organization | null> {
    return null;
  }
  async ensure(): Promise<void> {
    return;
  }
}

class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];
  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

function buildCreate() {
  const users = new FakeUserRepository();
  const userAccess = new FakeUserAccessRepository();
  const assembler = new UserViewAssembler(userAccess, new FakeOrganizationRepository());
  const audit = new RecordingAudit();
  const useCase = new CreateUserUseCase(users, userAccess, new PasswordService(), assembler, audit);
  return { users, userAccess, useCase };
}

function seedUser(overrides: Partial<Pick<UserAccount, 'accountType' | 'taxCode' | 'idNumber' | 'address' | 'representativeName'>> = {}): UserAccount {
  const user = UserAccount.create({
    username: 'nguoidung',
    passwordHash: 'scrypt$16384$8$1$aa$bb',
    displayName: 'Người dùng',
    title: '',
    defaultRoute: '/declarations',
    accountType: overrides.accountType ?? null,
    taxCode: overrides.taxCode ?? null,
    idNumber: overrides.idNumber ?? null,
    address: overrides.address ?? null,
    representativeName: overrides.representativeName ?? null,
  });
  return user;
}

function buildUpdate(seed: UserAccount) {
  const users = new FakeUserRepository([seed]);
  const userAccess = new FakeUserAccessRepository();
  const assembler = new UserViewAssembler(userAccess, new FakeOrganizationRepository());
  const audit = new RecordingAudit();
  const useCase = new UpdateUserUseCase(users, userAccess, assembler, audit);
  return { users, userAccess, useCase };
}

describe('CreateUserUseCase — chuẩn hóa theo loại tài khoản (F01)', () => {
  it('doanh nghiệp: giữ MST + người đại diện + địa chỉ, bỏ CCCD', async () => {
    const { users, useCase } = buildCreate();

    await useCase.execute({
      username: 'dn.a',
      password: 'MatKhau@123',
      displayName: 'Công ty A',
      title: '',
      accountType: AccountType.ENTERPRISE,
      taxCode: '  0101234567  ',
      representativeName: '  Nguyễn Văn A  ',
      address: '  Số 1  ',
      idNumber: 'khong-nen-luu',
    });

    const saved = users.users[0];
    expect(saved.accountType).toBe(AccountType.ENTERPRISE);
    expect(saved.taxCode).toBe('0101234567');
    expect(saved.representativeName).toBe('Nguyễn Văn A');
    expect(saved.address).toBe('Số 1');
    expect(saved.idNumber).toBeNull();
  });

  it('cá nhân: giữ CCCD + địa chỉ, bỏ MST và người đại diện', async () => {
    const { users, useCase } = buildCreate();

    await useCase.execute({
      username: 'ca.nhan',
      password: 'MatKhau@123',
      displayName: 'Nguyễn Văn B',
      title: '',
      accountType: AccountType.INDIVIDUAL,
      idNumber: '  012345678901  ',
      address: '  Số 2  ',
      taxCode: 'khong-nen-luu',
      representativeName: 'khong-nen-luu',
    });

    const saved = users.users[0];
    expect(saved.accountType).toBe(AccountType.INDIVIDUAL);
    expect(saved.idNumber).toBe('012345678901');
    expect(saved.address).toBe('Số 2');
    expect(saved.taxCode).toBeNull();
    expect(saved.representativeName).toBeNull();
  });

  it('nội bộ (không loại): bỏ toàn bộ MST/CCCD/địa chỉ/người đại diện', async () => {
    const { users, useCase } = buildCreate();

    await useCase.execute({
      username: 'noi.bo',
      password: 'MatKhau@123',
      displayName: 'Cán bộ',
      title: 'Chuyên viên',
      taxCode: '0101',
      idNumber: '0999',
      address: 'Số 3',
      representativeName: 'X',
    });

    const saved = users.users[0];
    expect(saved.accountType).toBeNull();
    expect(saved.taxCode).toBeNull();
    expect(saved.idNumber).toBeNull();
    expect(saved.address).toBeNull();
    expect(saved.representativeName).toBeNull();
  });
});

describe('UpdateUserUseCase — chuyển loại xóa trường không thuộc loại (F01)', () => {
  it('cá nhân → doanh nghiệp: bỏ CCCD, ghi MST', async () => {
    const seed = seedUser({ accountType: AccountType.INDIVIDUAL, idNumber: '012345678901', address: 'Số 2' });
    const { users, useCase } = buildUpdate(seed);

    await useCase.execute({
      userId: seed.id,
      accountType: AccountType.ENTERPRISE,
      taxCode: '0101234567',
      representativeName: 'Đại diện',
      address: 'Số 9',
    });

    const saved = users.users[0];
    expect(saved.accountType).toBe(AccountType.ENTERPRISE);
    expect(saved.taxCode).toBe('0101234567');
    expect(saved.idNumber).toBeNull();
    expect(saved.address).toBe('Số 9');
  });

  it('đổi sang cá nhân thì tự đồng bộ vai trò INDIVIDUAL (OWN)', async () => {
    const seed = seedUser({ accountType: AccountType.ENTERPRISE, taxCode: '0101234567' });
    const { userAccess, useCase } = buildUpdate(seed);

    await useCase.execute({
      userId: seed.id,
      accountType: AccountType.INDIVIDUAL,
      idNumber: '012345678901',
      address: 'Số 2',
    });

    expect(userAccess.rolesByUser.get(seed.id)).toEqual([
      { roleCode: 'INDIVIDUAL', dataScope: DataScopeLevel.OWN },
    ]);
  });

  it('không gửi accountType thì giữ nguyên nhóm trường định danh cũ', async () => {
    const seed = seedUser({ accountType: AccountType.ENTERPRISE, taxCode: '0101234567', address: 'Số 1' });
    const { users, useCase } = buildUpdate(seed);

    await useCase.execute({ userId: seed.id, displayName: 'Tên mới' });

    const saved = users.users[0];
    expect(saved.displayName).toBe('Tên mới');
    expect(saved.accountType).toBe(AccountType.ENTERPRISE);
    expect(saved.taxCode).toBe('0101234567');
    expect(saved.address).toBe('Số 1');
  });

  it('không tìm thấy tài khoản → 404 user.notFound', async () => {
    const seed = seedUser();
    const { useCase } = buildUpdate(seed);

    await expect(useCase.execute({ userId: 'khong-co', displayName: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    let key: string | undefined;
    await useCase.execute({ userId: 'khong-co', displayName: 'X' }).catch((error: NotFoundException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });
    expect(key).toBe('user.notFound');
  });
  it('trùng nhiều trường cùng lúc -> trả về mảng errors chứa tất cả các lỗi', async () => {
    const seed = seedUser({ accountType: AccountType.ENTERPRISE });
    const { users, useCase } = buildUpdate(seed);

    users.users.push(
      UserAccount.create({
        username: 'other.user',
        passwordHash: 'hash',
        displayName: 'Other',
        title: '',
        defaultRoute: '/',
        email: 'other@example.com',
        phone: '0987654321',
        taxCode: '0101234567',
        idNumber: '123456789012'
      }),
    );

    let errors: any[] | undefined;
    await useCase.execute({
      userId: seed.id,
      email: 'other@example.com',
      phone: '0987654321',
      taxCode: '0101234567',
      idNumber: '123456789012'
    }).catch((err: any) => {
      errors = err.getResponse?.()?.errors;
    });

    expect(errors).toBeDefined();
    expect(errors?.length).toBe(4);
    expect(errors?.map((e: any) => e.field)).toEqual(['email', 'phone', 'taxCode', 'idNumber']);
  });
});

describe('UpdateProfileUseCase — hồ sơ cá nhân ghi địa chỉ (F01)', () => {
  function build(seed: UserAccount) {
    const users = new FakeUserRepository([seed]);
    const assembler = new UserViewAssembler(new FakeUserAccessRepository(), new FakeOrganizationRepository());
    const audit = new RecordingAudit();
    return { users, audit, useCase: new UpdateProfileUseCase(users, assembler, audit) };
  }

  it('cập nhật thông tin liên hệ và ĐỊA CHỈ của chính mình', async () => {
    const seed = seedUser({ accountType: AccountType.ENTERPRISE, address: 'Địa chỉ cũ' });
    const { users, useCase } = build(seed);

    await useCase.execute({
      userId: seed.id,
      displayName: 'Tên mới',
      email: 'moi@example.com',
      phone: '0900000001',
      address: 'Địa chỉ mới',
    });

    const saved = users.users[0];
    expect(saved.displayName).toBe('Tên mới');
    expect(saved.email).toBe('moi@example.com');
    expect(saved.phone).toBe('0900000001');
    expect(saved.address).toBe('Địa chỉ mới');
  });

  it('không tìm thấy tài khoản → 404 auth.accountNotFound', async () => {
    const { useCase } = build(seedUser());

    let key: string | undefined;
    await useCase.execute({ userId: 'khong-co', address: 'X' }).catch((error: NotFoundException) => {
      expect(error).toBeInstanceOf(NotFoundException);
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });
    expect(key).toBe('auth.accountNotFound');
  });

  it('ghi nhật ký PROFILE_UPDATE có ảnh chụp địa chỉ trước/sau', async () => {
    const seed = seedUser({ accountType: AccountType.ENTERPRISE, address: 'Cũ' });
    const { audit, useCase } = build(seed);

    await useCase.execute({ userId: seed.id, address: 'Mới' });

    const entry = audit.entries.find((item) => item.action === 'PROFILE_UPDATE');
    expect((entry?.before as { address?: string })?.address).toBe('Cũ');
    expect((entry?.after as { address?: string })?.address).toBe('Mới');
  });

  it('chuẩn hóa khoảng trắng và cho phép xóa thông tin liên hệ nullable', async () => {
    const seed = seedUser({ accountType: AccountType.ENTERPRISE, address: 'Địa chỉ cũ' });
    seed.email = 'cu@example.com';
    seed.phone = '0900000000';
    const { users, useCase } = build(seed);

    await useCase.execute({
      userId: seed.id,
      displayName: '  Tên mới  ',
      title: '  Kiểm soát viên  ',
      email: '   ',
      phone: null,
      address: '',
    });

    expect(users.users[0]).toMatchObject({
      displayName: 'Tên mới',
      title: 'Kiểm soát viên',
      email: null,
      phone: null,
      address: null,
    });
  });

  it('cập nhật và lưu trữ avatarUrl của người dùng (SG-85)', async () => {
    const seed = seedUser({ accountType: AccountType.ENTERPRISE });
    const { users, useCase } = build(seed);

    const result = await useCase.execute({
      userId: seed.id,
      avatarUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA',
    });

    expect(users.users[0].avatarUrl).toBe('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA');
    expect(result.avatarUrl).toBe('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA');
  });
});
