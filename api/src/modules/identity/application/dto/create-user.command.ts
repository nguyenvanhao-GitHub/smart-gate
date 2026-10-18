import { AccountType } from '../../domain/user.entity';

export interface CreateUserCommand {
  username: string;
  password: string;
  displayName: string;
  title: string;
  /** Trang mặc định sau đăng nhập — bỏ trống thì suy ra từ loại tài khoản. */
  defaultRoute?: string;
  email?: string;
  phone?: string;
  organizationId?: string;
  /** Loại tài khoản: DN/cá nhân; bỏ trống = tài khoản nội bộ do admin tạo. */
  accountType?: AccountType;
  /** Mã số thuế — chỉ giữ khi `accountType = ENTERPRISE`. */
  taxCode?: string;
  /** Người đại diện — chỉ giữ khi `accountType = ENTERPRISE`. */
  representativeName?: string;
  /** Số CCCD/hộ chiếu — chỉ giữ khi `accountType = INDIVIDUAL`. */
  idNumber?: string;
  /** Địa chỉ liên hệ — chỉ giữ với tài khoản DN/cá nhân. */
  address?: string;
}
