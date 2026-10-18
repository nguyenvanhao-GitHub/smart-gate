import { UnauthorizedException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger, AuditResult } from '../../../../common/audit/audit-logger.port';
import { PaginatedResult } from '../../../../common/http/pagination';
import { UserAccount, UserStatus } from '../../domain/user.entity';
import { PublicUserDto, toPublicUser } from '../dto/public-user.dto';
import { MailerService } from '@nestjs-modules/mailer';
import { UserRepository, UserSearchCriteria } from '../ports/user.repository';
import { AuthTokenService } from './auth-token.service';
import { IdentityService } from './identity.service';
import { PasswordService } from './password.service';
import { UserViewAssembler } from './user-view.assembler';

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

class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];

  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

/** Assembler giả với vai trò cố định — đủ cho nhánh đăng nhập thành công. */
class StubAssembler {
  async assemble(user: UserAccount): Promise<PublicUserDto> {
    return { ...toPublicUser(user), roles: [{ code: 'ENTERPRISE', name: 'Doanh nghiệp', dataScope: 'OWN' } as never] };
  }
}

const PASSWORD = 'MatKhau@123';

/** Dịch vụ xác thực — trọng tâm F00: chờ duyệt và bị khóa là hai nhánh lỗi tách bạch. */
describe('IdentityService.login', () => {
  const passwords = new PasswordService();

  function makeUser(status: UserStatus): UserAccount {
    return UserAccount.create({
      username: 'nguoidung',
      passwordHash: passwords.hash(PASSWORD),
      displayName: 'Người dùng',
      title: '',
      defaultRoute: '/declarations',
      email: 'nd@example.com',
      phone: '0900000001',
      status,
    });
  }

  function build(seed: UserAccount[] = []) {
    const users = new FakeUserRepository(seed);
    const audit = new RecordingAudit();
    const tokens = new AuthTokenService({
      get: (key: string) => (key === 'AUTH_TOKEN_SECRET' ? 'secret-kiem-thu-f00' : undefined),
    } as never);
    const mailer = {
      sendPasswordReset: jest.fn().mockResolvedValue(true),
      sendUserApproved: jest.fn().mockResolvedValue(true),
    } as unknown as MailerService;
    const service = new IdentityService(
      users,
      passwords,
      tokens,
      new StubAssembler() as unknown as UserViewAssembler,
      mailer,
      audit,
    );
    return { users, audit, service, mailer };
  }

  it('tài khoản ACTIVE + đúng mật khẩu → cấp token và ghi mốc đăng nhập', async () => {
    const user = makeUser(UserStatus.ACTIVE);
    const { service, users } = build([user]);

    const result = await service.login('nguoidung', PASSWORD);

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.refreshExpiresIn).toBeGreaterThan(0);
    expect(result.user.username).toBe('nguoidung');
    expect(users.users[0].lastLoginAt).toBeInstanceOf(Date);
  });

  it('tài khoản PENDING → ném auth.accountPending (khác thông báo bị khóa)', async () => {
    const user = makeUser(UserStatus.PENDING);
    const { service, audit } = build([user]);

    let key: string | undefined;
    await service.login('nguoidung', PASSWORD).catch((error: UnauthorizedException) => {
      expect(error).toBeInstanceOf(UnauthorizedException);
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('auth.accountPending');
    // Ghi nhật ký thất bại với đúng lý do chờ duyệt.
    const failure = audit.entries.find((item) => item.result === AuditResult.FAILURE);
    expect((failure?.after as { reason?: string })?.reason).toBe('Tài khoản đang chờ duyệt');
  });

  it('tài khoản LOCKED → ném auth.accountLocked (khác nhánh chờ duyệt)', async () => {
    const user = makeUser(UserStatus.ACTIVE);
    user.lock('Vi phạm quy định');
    const { service, audit } = build([user]);

    let key: string | undefined;
    await service.login('nguoidung', PASSWORD).catch((error: UnauthorizedException) => {
      expect(error).toBeInstanceOf(UnauthorizedException);
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('auth.accountLocked');
    const failure = audit.entries.find((item) => item.result === AuditResult.FAILURE);
    expect((failure?.after as { reason?: string })?.reason).toBe('Tài khoản đang bị khóa');
  });

  it('sai mật khẩu → auth.invalidCredentials, không lộ trạng thái tài khoản', async () => {
    const user = makeUser(UserStatus.PENDING);
    const { service } = build([user]);

    let key: string | undefined;
    await service.login('nguoidung', 'sai-mat-khau').catch((error: UnauthorizedException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    // Sai mật khẩu phải chặn TRƯỚC khi kiểm trạng thái, tránh dò trạng thái tài khoản.
    expect(key).toBe('auth.invalidCredentials');
  });
});

describe('IdentityService.refresh', () => {
  const passwords = new PasswordService();

  function makeUser(status: UserStatus): UserAccount {
    return UserAccount.create({
      username: 'nguoidung',
      passwordHash: passwords.hash('MatKhau@123'),
      displayName: 'Người dùng',
      title: '',
      defaultRoute: '/declarations',
      email: 'nd@example.com',
      phone: '0900000001',
      status,
    });
  }

  function build(seed: UserAccount[] = []) {
    const users = new FakeUserRepository(seed);
    const audit = new RecordingAudit();
    const tokens = new AuthTokenService({
      get: (key: string) => (key === 'AUTH_TOKEN_SECRET' ? 'secret-kiem-thu-f00' : undefined),
    } as never);
    const mailer = {
      sendPasswordReset: jest.fn().mockResolvedValue(true),
      sendUserApproved: jest.fn().mockResolvedValue(true),
    } as unknown as MailerService;
    const service = new IdentityService(
      users,
      passwords,
      tokens,
      new StubAssembler() as unknown as UserViewAssembler,
      mailer,
      audit,
    );
    return { users, audit, service, tokens };
  }

  it('refresh token hợp lệ + tài khoản ACTIVE → cấp mới cả access token và refresh token', async () => {
    const user = makeUser(UserStatus.ACTIVE);
    const { service, tokens, audit } = build([user]);
    const { refreshToken: oldRefreshToken } = tokens.signRefreshToken({ sub: user.id, username: user.username });

    const result = await service.refresh(oldRefreshToken);

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.refreshToken).not.toBe(oldRefreshToken);
    expect(result.user.username).toBe('nguoidung');

    const auditEntry = audit.entries.find((item) => item.action === 'AUTH_REFRESH');
    expect(auditEntry).toBeDefined();
    expect(auditEntry?.actorUsername).toBe('nguoidung');
  });

  it('tài khoản LOCKED khi refresh → ném auth.accountLocked và ghi audit thất bại', async () => {
    const user = makeUser(UserStatus.ACTIVE);
    const { service, tokens, audit } = build([user]);
    const { refreshToken } = tokens.signRefreshToken({ sub: user.id, username: user.username });

    user.lock('Tài khoản bị tạm ngưng');

    let key: string | undefined;
    await service.refresh(refreshToken).catch((error: UnauthorizedException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('auth.accountLocked');
    const failure = audit.entries.find((item) => item.action === 'AUTH_REFRESH' && item.result === AuditResult.FAILURE);
    expect(failure).toBeDefined();
  });

  it('tài khoản không tồn tại → ném auth.accountNotFound', async () => {
    const { service, tokens } = build([]);
    const { refreshToken } = tokens.signRefreshToken({ sub: 'user-khong-ton-tai', username: 'ai-do' });

    let key: string | undefined;
    await service.refresh(refreshToken).catch((error: UnauthorizedException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('auth.accountNotFound');
  });
});
