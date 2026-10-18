import { AccountType } from '../../domain/user.entity';

/** Lệnh đăng ký tự phục vụ (F00) — doanh nghiệp/cá nhân tự khai để tạo tài khoản chờ duyệt. */
export interface RegisterUserCommand {
  /** Loại tài khoản: quyết định trường bắt buộc kèm theo (mã số thuế hoặc CCCD). */
  accountType: AccountType;
  username: string;
  password: string;
  /** Tên doanh nghiệp (DN) hoặc họ tên (cá nhân). */
  displayName: string;
  email: string;
  phone: string;
  /** Địa chỉ liên hệ — bắt buộc với cả doanh nghiệp lẫn cá nhân (SRS UI-01). */
  address: string;
  /** Bắt buộc khi `accountType = ENTERPRISE`. */
  taxCode?: string;
  /** Người đại diện — bắt buộc khi `accountType = ENTERPRISE`. */
  representativeName?: string;
  /** Bắt buộc khi `accountType = INDIVIDUAL`. */
  idNumber?: string;
}
