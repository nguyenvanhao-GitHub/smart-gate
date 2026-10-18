import { ConflictException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { PaginatedResult } from '../../../../common/http/pagination';
import { NotificationPublisher, PublishNotificationInput } from '../../../../common/notifications/notification-publisher.port';
import { NotificationType } from '../../../notifications/domain/notification-type.enum';
import {
  UserAccessRepository,
  UserRoleGrantInput,
} from '../../../access-control/application/ports/user-access.repository';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { AccountType, UserAccount, UserStatus } from '../../domain/user.entity';
import { RegisterUserCommand } from '../dto/register-user.command';
import { UserRepository, UserSearchCriteria } from '../ports/user.repository';
import { PasswordService } from '../services/password.service';
import { RegisterUserUseCase } from './register-user.use-case';

/** Kho người dùng giả trong bộ nhớ — chỉ dùng cho kiểm thử use-case đăng ký (F00). */
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

class RecordingNotificationPublisher implements NotificationPublisher {
  readonly published: PublishNotificationInput[] = [];

  async publish(input: PublishNotificationInput): Promise<void> {
    this.published.push(input);
  }
}

class RecordingUserAccess {
  readonly grants = new Map<string, UserRoleGrantInput[]>();

  async replaceRoles(userId: string, roles: UserRoleGrantInput[]): Promise<[]> {
    this.grants.set(userId, roles);
    return [];
  }
}

function makeExistingUser(overrides: Partial<Pick<UserAccount, 'username' | 'email' | 'phone' | 'taxCode' | 'idNumber'>> = {}): UserAccount {
  return UserAccount.create({
    username: overrides.username ?? 'nguoidung.cu',
    passwordHash: 'scrypt$16384$8$1$aa$bb',
    displayName: 'Người dùng cũ',
    title: '',
    defaultRoute: '/declarations',
    email: overrides.email ?? 'cu@example.com',
    phone: overrides.phone ?? '0900000000',
    taxCode: overrides.taxCode,
    idNumber: overrides.idNumber,
    status: UserStatus.ACTIVE,
  });
}

/** F00 — Đăng ký tự phục vụ: tạo tài khoản chờ duyệt, chặn mọi trùng lặp, ghi nhật ký. */
describe('RegisterUserUseCase', () => {
  const command: RegisterUserCommand = {
    accountType: AccountType.ENTERPRISE,
    username: 'DoanhNghiep.A',
    password: 'MatKhau@123',
    displayName: '  Công ty A  ',
    email: 'a@example.com',
    phone: '0912345678',
    address: '  Số 1, đường A, TP B  ',
    taxCode: '  0101234567  ',
    representativeName: '  Nguyễn Văn A  ',
  };

  function build(seed: UserAccount[] = []) {
    const users = new FakeUserRepository(seed);
    const userAccess = new RecordingUserAccess();
    const audit = new RecordingAudit();
    const notifications = new RecordingNotificationPublisher();
    const useCase = new RegisterUserUseCase(
      users,
      userAccess as unknown as UserAccessRepository,
      new PasswordService(),
      audit,
      notifications,
    );
    return { users, userAccess, audit, notifications, useCase };
  }

  it('tạo tài khoản ở trạng thái PENDING, tự gán ENTERPRISE (OWN) và không gán đơn vị', async () => {
    const { users, userAccess, useCase } = build();

    const result = await useCase.execute(command);

    expect(result).toEqual({ registered: true });
    expect(users.users).toHaveLength(1);
    const saved = users.users[0];
    expect(saved.status).toBe(UserStatus.PENDING);
    expect(saved.organizationId).toBeNull();
    expect(userAccess.grants.get(saved.id)).toEqual([
      { roleCode: 'ENTERPRISE', dataScope: DataScopeLevel.OWN },
    ]);
    // Chuẩn hóa: username về chữ thường, hiển thị được cắt khoảng trắng, chức danh để trống cho admin bổ sung.
    expect(saved.username).toBe('doanhnghiep.a');
    expect(saved.displayName).toBe('Công ty A');
    expect(saved.title).toBe('');
    expect(saved.defaultRoute).toBe('/declarations');
    // Mật khẩu phải được băm, tuyệt đối không lưu chữ thô.
    expect(saved.passwordHash).not.toBe(command.password);
    expect(new PasswordService().verify(command.password, saved.passwordHash)).toBe(true);
  });

  it('tài khoản doanh nghiệp: lưu mã số thuế (đã cắt khoảng trắng), không lưu CCCD', async () => {
    const { users, useCase } = build();

    await useCase.execute(command);

    const saved = users.users[0];
    expect(saved.accountType).toBe(AccountType.ENTERPRISE);
    expect(saved.taxCode).toBe('0101234567');
    expect(saved.idNumber).toBeNull();
    // Địa chỉ và người đại diện được cắt khoảng trắng, lưu đúng cho tài khoản doanh nghiệp.
    expect(saved.address).toBe('Số 1, đường A, TP B');
    expect(saved.representativeName).toBe('Nguyễn Văn A');
  });

  it('tài khoản cá nhân: lưu số CCCD/hộ chiếu, bỏ mã số thuế dù client có gửi', async () => {
    const { users, userAccess, useCase } = build();

    await useCase.execute({
      accountType: AccountType.INDIVIDUAL,
      username: 'ca.nhan.a',
      password: 'MatKhau@123',
      displayName: 'Nguyễn Văn A',
      email: 'canhan@example.com',
      phone: '0912345699',
      address: 'Số 2, đường C, TP D',
      idNumber: '012345678901',
      // client cố gửi kèm MST + người đại diện → use-case phải bỏ để không ghi lẫn loại.
      taxCode: '0101234567',
      representativeName: 'Không nên lưu',
    });

    const saved = users.users[0];
    expect(saved.accountType).toBe(AccountType.INDIVIDUAL);
    expect(saved.idNumber).toBe('012345678901');
    expect(saved.taxCode).toBeNull();
    // Cá nhân giữ địa chỉ nhưng KHÔNG lưu người đại diện.
    expect(saved.address).toBe('Số 2, đường C, TP D');
    expect(saved.representativeName).toBeNull();
    expect(userAccess.grants.get(saved.id)).toEqual([
      { roleCode: 'INDIVIDUAL', dataScope: DataScopeLevel.OWN },
    ]);
  });

  it('trùng username → 409, không tạo thêm tài khoản', async () => {
    const { users, useCase } = build([makeExistingUser({ username: 'doanhnghiep.a' })]);

    await expect(useCase.execute(command)).rejects.toBeInstanceOf(ConflictException);
    let key: string | undefined;
    await useCase.execute(command).catch((error: ConflictException) => {
      key = (error.getResponse() as any).errors?.[0]?.messageKey;
    });
    expect(key).toBe('auth.registerDuplicateUsername');
    expect(users.users).toHaveLength(1);
  });

  it('trùng email → 409', async () => {
    const { useCase } = build([makeExistingUser({ username: 'khac', email: 'a@example.com' })]);

    let key: string | undefined;
    await useCase.execute(command).catch((error: ConflictException) => {
      expect(error).toBeInstanceOf(ConflictException);
      key = (error.getResponse() as any).errors?.[0]?.messageKey;
    });
    expect(key).toBe('auth.registerDuplicateEmail');
  });

  it('trùng số điện thoại → 409', async () => {
    const { useCase } = build([makeExistingUser({ username: 'khac', email: 'khac@example.com', phone: '0912345678' })]);

    let key: string | undefined;
    await useCase.execute(command).catch((error: ConflictException) => {
      expect(error).toBeInstanceOf(ConflictException);
      key = (error.getResponse() as any).errors?.[0]?.messageKey;
    });
    expect(key).toBe('auth.registerDuplicatePhone');
  });

  it('trùng mã số thuế → 409', async () => {
    const existing = UserAccount.create({
      username: 'dn.cu',
      passwordHash: 'hash',
      displayName: 'DN Cũ',
      title: '',
      defaultRoute: '/',
      email: 'dncu@example.com',
      phone: '0900000001',
      taxCode: '0101234567',
    });
    const { useCase } = build([existing]);

    let key: string | undefined;
    await useCase.execute(command).catch((error: ConflictException) => {
      expect(error).toBeInstanceOf(ConflictException);
      key = (error.getResponse() as any).errors?.[0]?.messageKey;
    });
    expect(key).toBe('auth.registerDuplicateTaxCode');
  });

  it('trùng CCCD → 409', async () => {
    const existing = UserAccount.create({
      username: 'cn.cu',
      passwordHash: 'hash',
      displayName: 'Cá Nhân Cũ',
      title: '',
      defaultRoute: '/',
      email: 'cncu@example.com',
      phone: '0900000002',
      idNumber: '012345678901',
    });
    const { useCase } = build([existing]);

    let key: string | undefined;
    await useCase.execute({
      accountType: AccountType.INDIVIDUAL,
      username: 'ca.nhan.moi',
      password: 'MatKhau@123',
      displayName: 'Nguyễn Văn Mới',
      email: 'moi@example.com',
      phone: '0912345679',
      address: 'Địa chỉ',
      idNumber: '012345678901',
    }).catch((error: ConflictException) => {
      expect(error).toBeInstanceOf(ConflictException);
      key = (error.getResponse() as any).errors?.[0]?.messageKey;
    });
    expect(key).toBe('auth.registerDuplicateIdNumber');
  });

  it('trùng nhiều trường cùng lúc -> trả về mảng errors chứa tất cả các lỗi', async () => {
    const { useCase } = build([
      makeExistingUser({ username: 'doanhnghiep1', email: 'dn1@example.com', phone: '0912345678', taxCode: '0101234567' }),
    ]);

    let errors: any[] | undefined;
    await useCase.execute({
      ...command,
      username: 'doanhnghiep1',
      email: 'dn1@example.com',
      phone: '0912345678',
      taxCode: '0101234567',
    }).catch((error: ConflictException) => {
      errors = (error.getResponse() as any).errors;
    });

    expect(errors).toBeDefined();
    expect(errors?.length).toBe(4);
    expect(errors?.map((e) => e.field)).toEqual(['username', 'email', 'phone', 'taxCode']);
  });

  it('ghi nhật ký kiểm toán hành động USER_REGISTER trỏ đúng tài khoản vừa tạo', async () => {
    const { users, audit, useCase } = build();

    await useCase.execute(command);

    const entry = audit.entries.find((item) => item.action === 'USER_REGISTER');
    expect(entry).toBeDefined();
    expect(entry?.targetType).toBe('USER');
    expect(entry?.targetId).toBe(users.users[0].id);
    expect(entry?.actorUsername).toBe('doanhnghiep.a');
    // Ảnh chụp "after" là bản công khai, không được lộ passwordHash.
    expect(entry?.after).not.toHaveProperty('passwordHash');
    expect((entry?.after as { status?: string })?.status).toBe(UserStatus.PENDING);
  });

  it('phát thông báo USER_REGISTERED đúng định dạng khi đăng ký thành công', async () => {
    const { notifications, useCase } = build();

    await useCase.execute(command);

    expect(notifications.published).toHaveLength(1);
    expect(notifications.published[0]).toMatchObject({
      type: NotificationType.USER_REGISTERED,
      titleKey: 'notification.userRegisteredTitle',
      contentKey: 'notification.userRegisteredContent',
      contentParams: { username: 'doanhnghiep.a' },
      route: '/admin/users?keyword=doanhnghiep.a',
    });
  });
});


