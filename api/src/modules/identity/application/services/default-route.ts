import { AccountType } from '../../domain/user.entity';
import { isSelfRegisteredAccountType } from './self-registered-role';

/**
 * Trang mặc định sau đăng nhập, suy từ **vai trò RBAC** của tài khoản.
 * Cột `users.default_route` vẫn còn; web dùng nó để điều hướng. Quản trị viên có thể ghi
 * đè bằng cách gửi `defaultRoute` tường minh khi tạo/sửa tài khoản.
 *
 * Chọn theo **vai trò đầu tiên** trong danh sách có tuyến khai; không khớp thì về màn mặc định.
 */
export const ROUTE_BY_RBAC_ROLE: Record<string, string> = {
  SYS_ADMIN: '/operations/dashboard',
  MANAGEMENT: '/operations/dashboard',
  DISPATCHER: '/operations/vehicle-confirmation',
  CUSTOMS: '/workflow/queue',
  BORDER_GUARD: '/workflow/queue',
  QUARANTINE: '/workflow/queue',
  FEE_COLLECTOR: '/fees/tax',
  YARD_MANAGER: '/operations/customs-b5',
  ENTERPRISE: '/declarations',
  INDIVIDUAL: '/declarations',
};

export const FALLBACK_OFFICER_ROUTE = '/operations/dashboard';
export const FALLBACK_DECLARATION_ROUTE = '/declarations';
export const FALLBACK_DEFAULT_ROUTE = FALLBACK_OFFICER_ROUTE;

export function defaultRouteForRoles(
  rbacRoleCodes: string[],
  accountType?: AccountType | null,
): string {
  for (const code of rbacRoleCodes) {
    const route = ROUTE_BY_RBAC_ROLE[code];
    if (route) return route;
  }
  if (isSelfRegisteredAccountType(accountType ?? null)) {
    return FALLBACK_DECLARATION_ROUTE;
  }
  return FALLBACK_OFFICER_ROUTE;
}
