import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { PaginatedResult } from '../../../../common/http/pagination';
import { UserAccount, UserStatus } from '../../domain/user.entity';
import { UserRepository, UserSearchCriteria } from '../ports/user.repository';
import { PasswordService } from '../services/password.service';
import { ChangePasswordUseCase } from './change-password.use-case';

/** Kho người dùng giả trong bộ nhớ cho kiểm thử đổi mật khẩu. */
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

/**
 * BUG-011 — Sai mật khẩu hiện tại phải trả 400 (`auth.currentPasswordWrong`), KHÔNG phải 401.
 * 401 khiến web hiểu nhầm là hết phiên rồi đăng xuất người dùng.
 */
describe('ChangePasswordUseCase', () => {
  const passwords = new PasswordService();
  const CURRENT = 'MatKhauCu@123';

  function build() {
    const user = UserAccount.create({
      username: 'canbo.a',
      passwordHash: passwords.hash(CURRENT),
      displayName: 'Cán bộ A',
      title: 'Chuyên viên',
      defaultRoute: '/declarations',
      email: 'canbo@example.com',
      phone: '0912345678',
      status: UserStatus.ACTIVE,
    });
    const users = new FakeUserRepository([user]);
    const audit = new RecordingAudit();
    const useCase = new ChangePasswordUseCase(users, passwords, audit);
    return { user, users, audit, useCase };
  }

  it('mật khẩu hiện tại sai → 400 với khóa auth.currentPasswordWrong (KHÔNG phải 401)', async () => {
    const { user, useCase, audit } = build();

    let caught: unknown;
    await useCase
      .execute({ userId: user.id, currentPassword: 'SaiHoanToan@9', newPassword: 'MatKhauMoi@123' })
      .catch((error: unknown) => (caught = error));

    expect(caught).toBeInstanceOf(BadRequestException);
    expect(caught).not.toBeInstanceOf(UnauthorizedException);
    expect((caught as BadRequestException).getStatus()).toBe(400);
    expect(((caught as BadRequestException).getResponse() as { messageKey: string }).messageKey).toBe(
      'auth.currentPasswordWrong',
    );
    // Vẫn ghi nhật ký thất bại.
    expect(audit.entries.some((entry) => entry.action === 'PROFILE_CHANGE_PASSWORD')).toBe(true);
  });

  it('không tìm thấy tài khoản → 404', async () => {
    const { useCase } = build();

    await expect(
      useCase.execute({ userId: 'khong-ton-tai', currentPassword: CURRENT, newPassword: 'MatKhauMoi@123' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('mật khẩu mới trùng mật khẩu hiện tại → 400 auth.newPasswordSame', async () => {
    const { user, useCase } = build();

    let caught: unknown;
    await useCase
      .execute({ userId: user.id, currentPassword: CURRENT, newPassword: CURRENT })
      .catch((error: unknown) => (caught = error));

    expect(caught).toBeInstanceOf(BadRequestException);
    expect(((caught as BadRequestException).getResponse() as { messageKey: string }).messageKey).toBe(
      'auth.newPasswordSame',
    );
  });

  it('đúng mật khẩu hiện tại → đổi mật khẩu, băm lại và ghi nhật ký thành công', async () => {
    const { user, users, useCase, audit } = build();

    const result = await useCase.execute({
      userId: user.id,
      currentPassword: CURRENT,
      newPassword: 'MatKhauMoi@123',
    });

    expect(result).toEqual({ changed: true });
    const saved = users.users[0];
    expect(passwords.verify('MatKhauMoi@123', saved.passwordHash)).toBe(true);
    expect(passwords.verify(CURRENT, saved.passwordHash)).toBe(false);
    const entry = audit.entries.find((item) => item.action === 'PROFILE_CHANGE_PASSWORD');
    expect(entry?.result).toBeUndefined();
  });
});
