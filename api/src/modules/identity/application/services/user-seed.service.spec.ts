import { PaginatedResult } from '../../../../common/http/pagination';
import { Organization } from '../../../access-control/domain/access-control.entities';
import { OrganizationRepository } from '../../../access-control/application/ports/organization.repository';
import {
  UserAccessRepository,
  UserAssignmentInput,
  UserRoleGrantInput,
} from '../../../access-control/application/ports/user-access.repository';
import { AccountType, UserAccount } from '../../domain/user.entity';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { UserRepository } from '../ports/user.repository';
import { DEFAULT_ACCOUNT_SEEDS } from './default-account-seed';
import { PasswordService } from './password.service';
import { UserSeedService } from './user-seed.service';

/**
 * Sau khi gỡ cột `users.role` + cơ chế legacy, seed phải **tự** ghi vai trò RBAC vào `user_roles`,
 * không còn suy ngược từ mã vai trò cũ. Bộ test khoá 3 điều:
 *   1. tài khoản mặc định được tạo đúng một lần (idempotent);
 *   2. vai trò RBAC được gán đúng theo dữ liệu seed (admin → SYS_ADMIN…);
 *   3. tài khoản đã có vai trò thì **không** bị ghi đè (không đè cấu hình quản trị viên).
 */
class FakeUserRepository implements UserRepository {
  private readonly byUsername = new Map<string, UserAccount>();

  count(): Promise<number> {
    return Promise.resolve(this.byUsername.size);
  }
  findMany(): Promise<PaginatedResult<UserAccount>> {
    const items = [...this.byUsername.values()];
    return Promise.resolve({ items, total: items.length, page: 1, pageSize: 100 });
  }
  findById(id: string): Promise<UserAccount | null> {
    return Promise.resolve([...this.byUsername.values()].find((user) => user.id === id) ?? null);
  }
  findByUsername(username: string): Promise<UserAccount | null> {
    return Promise.resolve(this.byUsername.get(username) ?? null);
  }
  findByEmail(email: string): Promise<UserAccount | null> {
    return Promise.resolve([...this.byUsername.values()].find((user) => user.email === email) ?? null);
  }
  findByPhone(phone: string): Promise<UserAccount | null> {
    return Promise.resolve([...this.byUsername.values()].find((user) => user.phone === phone) ?? null);
  }
  findByTaxCode(taxCode: string): Promise<UserAccount | null> {
    return Promise.resolve([...this.byUsername.values()].find((user) => user.taxCode === taxCode) ?? null);
  }
  findByIdNumber(idNumber: string): Promise<UserAccount | null> {
    return Promise.resolve([...this.byUsername.values()].find((user) => user.idNumber === idNumber) ?? null);
  }
  save(user: UserAccount): Promise<UserAccount> {
    this.byUsername.set(user.username, user);
    return Promise.resolve(user);
  }
  delete(id: string): Promise<void> {
    const found = [...this.byUsername.values()].find((user) => user.id === id);
    if (found) this.byUsername.delete(found.username);
    return Promise.resolve();
  }
}

class FakeUserAccessRepository implements Partial<UserAccessRepository> {
  readonly rolesByUser = new Map<string, UserRoleGrantInput[]>();
  readonly assignmentsByUser = new Map<string, UserAssignmentInput[]>();

  countRoles(userId: string): Promise<number> {
    return Promise.resolve(this.rolesByUser.get(userId)?.length ?? 0);
  }
  listRoles(userId: string) {
    return Promise.resolve(
      (this.rolesByUser.get(userId) ?? []).map((role) => ({
        ...role,
        roleName: role.roleCode,
        organizationId: null,
        organizationCode: null,
      })),
    );
  }
  listAssignments(userId: string) {
    return Promise.resolve(
      (this.assignmentsByUser.get(userId) ?? []).map((a) => ({
        type: a.type,
        value: a.value,
        label: a.label ?? null,
        organizationId: null,
      })),
    );
  }
  replaceRoles(userId: string, grants: UserRoleGrantInput[]): Promise<never[]> {
    this.rolesByUser.set(userId, grants);
    return Promise.resolve([]);
  }
  replaceAssignments(userId: string, assignments: UserAssignmentInput[]): Promise<never[]> {
    this.assignmentsByUser.set(userId, assignments);
    return Promise.resolve([]);
  }
}

const ORG = { id: 'org-1', name: 'Cửa khẩu', type: 'BORDER_GATE', parentId: null, isActive: true } as unknown as Organization;

class FakeOrganizationRepository implements Partial<OrganizationRepository> {
  findByCode(code: string): Promise<Organization | null> {
    return Promise.resolve({ ...ORG, code });
  }
}

function build() {
  const users = new FakeUserRepository();
  const access = new FakeUserAccessRepository();
  const organizations = new FakeOrganizationRepository();
  const service = new UserSeedService(
    users,
    access as unknown as UserAccessRepository,
    organizations as unknown as OrganizationRepository,
    new PasswordService(),
  );
  return { users, access, service };
}

describe('UserSeedService', () => {
  it('tạo đủ tài khoản mặc định và gán vai trò RBAC từ dữ liệu seed', async () => {
    const { users, access, service } = build();

    await service.onApplicationBootstrap();

    const admin = await users.findByUsername('admin');
    expect(admin).not.toBeNull();
    // Quản trị được gán thêm các vai trò lực lượng để thao tác được mọi bước liên ngành
    // (`workflow_step_roles` không có cửa hậu cho `SYS_ADMIN`).
    expect(access.rolesByUser.get(admin!.id)?.map((role) => role.roleCode)).toEqual([
      'SYS_ADMIN',
      'BORDER_GUARD',
      'CUSTOMS',
      'QUARANTINE',
      'FEE_COLLECTOR',
      'DISPATCHER',
      'YARD_MANAGER',
      'MANAGEMENT',
    ]);

    const haiquan = await users.findByUsername('haiquan');
    expect(access.rolesByUser.get(haiquan!.id)?.map((role) => role.roleCode)).toEqual(['CUSTOMS']);

    const bienphong = await users.findByUsername('bienphong');
    expect(access.rolesByUser.get(bienphong!.id)?.map((role) => role.roleCode)).toEqual(['BORDER_GUARD']);

    // Mọi tài khoản seed đều được gán ít nhất một vai trò RBAC.
    for (const seed of DEFAULT_ACCOUNT_SEEDS) {
      const user = await users.findByUsername(seed.username);
      expect(access.rolesByUser.get(user!.id)?.length).toBe(seed.roles.length);
    }
  });

  it('idempotent: chạy lại không tạo trùng tài khoản và không gán lại vai trò', async () => {
    const { users, access, service } = build();

    await service.onApplicationBootstrap();
    const admin = await users.findByUsername('admin');
    // Giả lập quản trị viên đã chỉnh tay vai trò của admin sau lần seed đầu.
    access.rolesByUser.set(admin!.id, [{ roleCode: 'MANAGEMENT', dataScope: access.rolesByUser.get(admin!.id)![0].dataScope }]);

    await service.onApplicationBootstrap();

    expect(await users.count()).toBe(DEFAULT_ACCOUNT_SEEDS.length);
    // Không bị ghi đè về SYS_ADMIN — cấu hình quản trị viên được tôn trọng.
    expect(access.rolesByUser.get(admin!.id)?.map((role) => role.roleCode)).toEqual(['MANAGEMENT']);
  });

  it('backfill tài khoản cá nhân cũ từ ENTERPRISE sang INDIVIDUAL (OWN)', async () => {
    const { users, access, service } = build();
    const individual = await users.save(
      UserAccount.create({
        username: 'ca.nhan.cu',
        passwordHash: 'hash',
        displayName: 'Cá nhân cũ',
        title: '',
        defaultRoute: '/declarations',
        accountType: AccountType.INDIVIDUAL,
      }),
    );
    access.rolesByUser.set(individual.id, [
      { roleCode: 'ENTERPRISE', dataScope: DataScopeLevel.OWN },
    ]);

    await service.onApplicationBootstrap();

    expect(access.rolesByUser.get(individual.id)).toEqual([
      { roleCode: 'INDIVIDUAL', dataScope: DataScopeLevel.OWN },
    ]);
  });

  it('đồng bộ defaultRoute cho tài khoản mặc định đã tồn tại từ trước (vd dieuphoi)', async () => {
    const { users, service } = build();
    await users.save(
      UserAccount.create({
        username: 'dieuphoi',
        passwordHash: 'hash',
        displayName: 'Điều phối Chiềng Khương',
        title: 'Trung tâm điều hành',
        defaultRoute: '/operations/dashboard', // route cũ trước khi sửa
      }),
    );

    await service.onApplicationBootstrap();

    const dieuphoiNew = await users.findByUsername('dieuphoi');
    expect(dieuphoiNew?.defaultRoute).toBe('/operations/vehicle-confirmation');
  });
});
