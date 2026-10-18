import { randomUUID } from 'crypto';

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
  /** Tài khoản tự đăng ký (F00) đang chờ admin duyệt — chưa đăng nhập được. */
  PENDING = 'PENDING',
}

/**
 * Loại tài khoản tự đăng ký (F00) — mã ASCII tập đóng theo SRS UI-01.
 * `ENTERPRISE` khai theo pháp nhân (bắt buộc mã số thuế); `INDIVIDUAL` khai theo cá nhân
 * (bắt buộc số CCCD/hộ chiếu). Tài khoản do admin tạo (F01) không thuộc loại nào → `null`.
 */
export enum AccountType {
  ENTERPRISE = 'ENTERPRISE',
  INDIVIDUAL = 'INDIVIDUAL',
}

export class UserAccount {
  constructor(
    public readonly id: string,
    public username: string,
    public passwordHash: string,
    public displayName: string,
    public title: string,
    public defaultRoute: string,
    public status: UserStatus,
    public createdAt: Date,
    public updatedAt: Date,
    public email: string | null = null,
    public phone: string | null = null,
    public organizationId: string | null = null,
    /** Lý do khóa tài khoản — F03 bắt buộc nhập khi khóa. */
    public lockReason: string | null = null,
    /** Lần đăng nhập thành công gần nhất — cột "Lần đăng nhập cuối" của UI-13. */
    public lastLoginAt: Date | null = null,
    /** Loại tài khoản tự đăng ký (F00): DN/cá nhân; tài khoản do admin tạo là `null`. */
    public accountType: AccountType | null = null,
    /** Mã số thuế — chỉ tài khoản doanh nghiệp mới có. */
    public taxCode: string | null = null,
    /** Số CCCD/hộ chiếu — chỉ tài khoản cá nhân mới có. */
    public idNumber: string | null = null,
    /** Địa chỉ liên hệ — tài khoản tự đăng ký (DN/cá nhân) khai; tài khoản nội bộ để trống. */
    public address: string | null = null,
    /** Người đại diện — chỉ tài khoản doanh nghiệp mới có. */
    public representativeName: string | null = null,
    /** Ảnh đại diện (URL hoặc chuỗi base64) — SG-85. */
    public avatarUrl: string | null = null,
    /** Cờ bảo vệ tài khoản Quản trị tối cao khỏi bị gỡ vai trò Quản trị hoặc xóa/khóa tài khoản. */
    public isProtected: boolean = false,
  ) {}

  static create(input: {
    username: string;
    passwordHash: string;
    displayName: string;
    title: string;
    defaultRoute: string;
    email?: string | null;
    phone?: string | null;
    organizationId?: string | null;
    /** Mặc định `ACTIVE`; tài khoản tự đăng ký (F00) truyền `PENDING`. */
    status?: UserStatus;
    accountType?: AccountType | null;
    taxCode?: string | null;
    idNumber?: string | null;
    address?: string | null;
    representativeName?: string | null;
    avatarUrl?: string | null;
    isProtected?: boolean;
  }): UserAccount {
    const now = new Date();
    return new UserAccount(
      randomUUID(),
      input.username,
      input.passwordHash,
      input.displayName,
      input.title,
      input.defaultRoute,
      input.status ?? UserStatus.ACTIVE,
      now,
      now,
      input.email ?? null,
      input.phone ?? null,
      input.organizationId ?? null,
      null,
      null,
      input.accountType ?? null,
      input.taxCode ?? null,
      input.idNumber ?? null,
      input.address ?? null,
      input.representativeName ?? null,
      input.avatarUrl ?? null,
      input.isProtected ?? false,
    );
  }

  updateProfile(
    input: Partial<
      Pick<
        UserAccount,
        | 'displayName'
        | 'title'
        | 'defaultRoute'
        | 'status'
        | 'email'
        | 'phone'
        | 'organizationId'
        | 'accountType'
        | 'taxCode'
        | 'idNumber'
        | 'address'
        | 'representativeName'
        | 'avatarUrl'
        | 'isProtected'
      >
    >,
  ): void {
    if (input.displayName !== undefined) this.displayName = input.displayName;
    if (input.title !== undefined) this.title = input.title;
    if (input.defaultRoute !== undefined) this.defaultRoute = input.defaultRoute;
    if (input.status !== undefined) this.status = input.status;
    if (input.email !== undefined) this.email = input.email;
    if (input.phone !== undefined) this.phone = input.phone;
    if (input.organizationId !== undefined) this.organizationId = input.organizationId;
    if (input.accountType !== undefined) this.accountType = input.accountType;
    if (input.taxCode !== undefined) this.taxCode = input.taxCode;
    if (input.idNumber !== undefined) this.idNumber = input.idNumber;
    if (input.address !== undefined) this.address = input.address;
    if (input.representativeName !== undefined) this.representativeName = input.representativeName;
    if (input.avatarUrl !== undefined) this.avatarUrl = input.avatarUrl;
    if (input.isProtected !== undefined) this.isProtected = input.isProtected;
    this.updatedAt = new Date();
  }

  changePassword(passwordHash: string): void {
    this.passwordHash = passwordHash;
    this.updatedAt = new Date();
  }

  /** Ghi mốc đăng nhập thành công; không đụng `updatedAt` để không nhiễu lịch sử chỉnh sửa hồ sơ. */
  recordLogin(at: Date = new Date()): void {
    this.lastLoginAt = at;
  }

  lock(reason: string): void {
    this.status = UserStatus.LOCKED;
    this.lockReason = reason;
    this.updatedAt = new Date();
  }

  unlock(): void {
    this.status = UserStatus.ACTIVE;
    this.lockReason = null;
    this.updatedAt = new Date();
  }

  /** Duyệt tài khoản chờ (F00): PENDING → ACTIVE. Ràng buộc "chỉ duyệt PENDING" nằm ở use-case. */
  approve(): void {
    this.status = UserStatus.ACTIVE;
    this.updatedAt = new Date();
  }
}
