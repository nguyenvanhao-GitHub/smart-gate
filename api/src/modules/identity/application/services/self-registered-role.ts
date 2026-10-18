import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { UserRoleGrantInput } from '../../../access-control/application/ports/user-access.repository';
import { AccountType } from '../../domain/user.entity';

/**
 * Vai trò mặc định của tài khoản ngoài hệ thống. Loại tài khoản quyết định mã vai trò và cả hai
 * chỉ được thao tác dữ liệu của chính mình (`OWN`).
 */
export const ACCOUNT_TYPE_ROLE: Record<AccountType, string> = {
  [AccountType.ENTERPRISE]: 'ENTERPRISE',
  [AccountType.INDIVIDUAL]: 'INDIVIDUAL',
};

/** Loại tài khoản tự đăng ký (F00) đủ điều kiện tự gán vai trò. */
export const SELF_REGISTERED_ACCOUNT_TYPES: readonly AccountType[] = [
  AccountType.ENTERPRISE,
  AccountType.INDIVIDUAL,
];

/** Có phải loại tài khoản DN/cá nhân với vai trò được hệ thống quản lý tự động không. */
export function isSelfRegisteredAccountType(accountType: AccountType | null): accountType is AccountType {
  return accountType !== null && SELF_REGISTERED_ACCOUNT_TYPES.includes(accountType);
}

/** Mã vai trò cố định tương ứng loại tài khoản. */
export function selfRegisteredRoleCode(accountType: AccountType): string {
  return ACCOUNT_TYPE_ROLE[accountType];
}

/** Bộ vai trò cố định cấp cho tài khoản DN/cá nhân. */
export function selfRegisteredRoleGrants(accountType: AccountType): UserRoleGrantInput[] {
  return [{ roleCode: selfRegisteredRoleCode(accountType), dataScope: DataScopeLevel.OWN }];
}
