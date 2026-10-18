import { UserAccount } from '../../../identity/domain/user.entity';
import { UserRepository, UserSearchCriteria } from '../../../identity/application/ports/user.repository';
import { PaginatedResult } from '../../../../common/http/pagination';
import { DossierAccountLinkerService } from './dossier-account-linker.service';

class FakeUserRepository implements UserRepository {
  readonly users: UserAccount[] = [];

  async count(): Promise<number> {
    return this.users.length;
  }
  async findMany(_criteria: UserSearchCriteria): Promise<PaginatedResult<UserAccount>> {
    return { items: this.users, total: this.users.length, page: 1, pageSize: this.users.length };
  }
  async findById(id: string): Promise<UserAccount | null> {
    return this.users.find((u) => u.id === id) ?? null;
  }
  async findByUsername(username: string): Promise<UserAccount | null> {
    return this.users.find((u) => u.username === username) ?? null;
  }
  async findByEmail(email: string): Promise<UserAccount | null> {
    return this.users.find((u) => u.email === email) ?? null;
  }
  async findByPhone(phone: string): Promise<UserAccount | null> {
    return this.users.find((u) => u.phone === phone) ?? null;
  }
  async findByTaxCode(taxCode: string): Promise<UserAccount | null> {
    return this.users.find((u) => u.taxCode === taxCode) ?? null;
  }
  async findByIdNumber(idNumber: string): Promise<UserAccount | null> {
    return this.users.find((u) => u.idNumber === idNumber) ?? null;
  }
  async save(user: UserAccount): Promise<UserAccount> {
    this.users.push(user);
    return user;
  }
  async delete(id: string): Promise<void> {
    const idx = this.users.findIndex((u) => u.id === id);
    if (idx >= 0) this.users.splice(idx, 1);
  }
}

describe('DossierAccountLinkerService', () => {
  it('tra cứu đúng tài khoản nội bộ theo thư điện tử (email)', async () => {
    const users = new FakeUserRepository();
    const internalUser = UserAccount.create({
      username: 'canbo01',
      email: 'canbo01@cqnn.gov.vn',
      passwordHash: 'hash',
      displayName: 'Cán bộ 01',
      title: '',
      defaultRoute: '/',
    });
    users.users.push(internalUser);

    const linker = new DossierAccountLinkerService(users);

    const matchedId = await linker.resolveAccountId({ email: 'canbo01@cqnn.gov.vn' });
    expect(matchedId).toBe(internalUser.id);

    const notFoundId = await linker.resolveAccountId({ email: 'other@cqnn.gov.vn' });
    expect(notFoundId).toBeNull();
  });

  it('tra cứu đúng tài khoản doanh nghiệp theo taxCode', async () => {
    const users = new FakeUserRepository();
    const enterpriseUser = UserAccount.create({
      username: 'congtya',
      passwordHash: 'hash',
      displayName: 'Công ty A',
      title: '',
      defaultRoute: '/',
      taxCode: '0101234567',
    });
    users.users.push(enterpriseUser);

    const linker = new DossierAccountLinkerService(users);

    const matchedId = await linker.resolveAccountId({ taxCode: '0101234567' });
    expect(matchedId).toBe(enterpriseUser.id);
  });

  it('tra cứu đúng tài khoản cá nhân theo CCCD/idNumber', async () => {
    const users = new FakeUserRepository();
    const individualUser = UserAccount.create({
      username: 'canhanb',
      passwordHash: 'hash',
      displayName: 'Nguyễn Văn B',
      title: '',
      defaultRoute: '/',
      idNumber: '012345678901',
    });
    users.users.push(individualUser);

    const linker = new DossierAccountLinkerService(users);

    const matchedId = await linker.resolveAccountId({ idNumber: '012345678901' });
    expect(matchedId).toBe(individualUser.id);
  });

  it('ưu tiên idNumber của cá nhân khi accountType = INDIVIDUAL ngay cả khi input có email của admin khai hộ', async () => {
    const users = new FakeUserRepository();
    const adminUser = UserAccount.create({
      username: 'admin',
      email: 'admin@smartgate.vn',
      passwordHash: 'hash',
      displayName: 'Quản trị viên',
      title: '',
      defaultRoute: '/',
    });
    const individualUser = UserAccount.create({
      username: 'canhan',
      email: 'canhan@gmail.com',
      idNumber: '038090001234',
      passwordHash: 'hash',
      displayName: 'Trần Văn C',
      title: '',
      defaultRoute: '/',
    });
    users.users.push(adminUser, individualUser);

    const linker = new DossierAccountLinkerService(users);

    const matchedId = await linker.resolveAccountId({
      accountType: 'INDIVIDUAL',
      idNumber: '038090001234',
      email: 'admin@smartgate.vn', // Email của admin khai hộ
    });
    expect(matchedId).toBe(individualUser.id);
  });

  it('ưu tiên taxCode của doanh nghiệp khi accountType = ENTERPRISE ngay cả khi input có email của admin', async () => {
    const users = new FakeUserRepository();
    const adminUser = UserAccount.create({
      username: 'admin',
      email: 'admin@smartgate.vn',
      passwordHash: 'hash',
      displayName: 'Quản trị viên',
      title: '',
      defaultRoute: '/',
    });
    const enterpriseUser = UserAccount.create({
      username: 'ctyxyz',
      email: 'contact@ctyxyz.com',
      taxCode: '0109998888',
      passwordHash: 'hash',
      displayName: 'Công ty XYZ',
      title: '',
      defaultRoute: '/',
    });
    users.users.push(adminUser, enterpriseUser);

    const linker = new DossierAccountLinkerService(users);

    const matchedId = await linker.resolveAccountId({
      accountType: 'ENTERPRISE',
      taxCode: '0109998888',
      email: 'admin@smartgate.vn',
    });
    expect(matchedId).toBe(enterpriseUser.id);
  });

  it('tra cứu đúng tài khoản doanh nghiệp khi accountType = ENTERPRISE và định danh nằm ở idNumber', async () => {
    const users = new FakeUserRepository();
    const enterpriseUser = UserAccount.create({
      username: 'ctyxyz',
      email: 'contact@ctyxyz.com',
      taxCode: '0109998888',
      passwordHash: 'hash',
      displayName: 'Công ty XYZ',
      title: '',
      defaultRoute: '/',
    });
    users.users.push(enterpriseUser);

    const linker = new DossierAccountLinkerService(users);

    const matchedId = await linker.resolveAccountId({
      accountType: 'ENTERPRISE',
      idNumber: '0109998888',
    });
    expect(matchedId).toBe(enterpriseUser.id);
  });

  it('fallback: khi không có accountType, ưu tiên taxCode/idNumber trước email', async () => {
    const users = new FakeUserRepository();
    const adminUser = UserAccount.create({
      username: 'admin',
      email: 'admin@smartgate.vn',
      passwordHash: 'hash',
      displayName: 'Quản trị viên',
      title: '',
      defaultRoute: '/',
    });
    const individualUser = UserAccount.create({
      username: 'canhan',
      idNumber: '001200003333',
      passwordHash: 'hash',
      displayName: 'Lê Văn D',
      title: '',
      defaultRoute: '/',
    });
    users.users.push(adminUser, individualUser);

    const linker = new DossierAccountLinkerService(users);

    const matchedId = await linker.resolveAccountId({
      taxCode: '001200003333',
      email: 'admin@smartgate.vn',
    });
    expect(matchedId).toBe(individualUser.id);
  });
});
