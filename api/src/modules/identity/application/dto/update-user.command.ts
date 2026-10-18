import { AccountType, UserStatus } from '../../domain/user.entity';

export interface UpdateUserCommand {
  userId: string;
  displayName?: string;
  title?: string;
  defaultRoute?: string;
  status?: UserStatus;
  email?: string;
  phone?: string;
  organizationId?: string;
  /** Loại tài khoản: DN/cá nhân; bỏ trống = giữ nguyên. */
  accountType?: AccountType;
  taxCode?: string;
  representativeName?: string;
  idNumber?: string;
  address?: string;
}
