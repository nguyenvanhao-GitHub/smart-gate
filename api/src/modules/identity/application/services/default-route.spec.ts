import { AccountType } from '../../domain/user.entity';
import {
  defaultRouteForRoles,
  FALLBACK_DECLARATION_ROUTE,
  FALLBACK_OFFICER_ROUTE,
  ROUTE_BY_RBAC_ROLE,
} from './default-route';

describe('defaultRouteForRoles', () => {
  it('trả về đúng đường dẫn cho các vai trò đơn lẻ trong hệ thống', () => {
    expect(defaultRouteForRoles(['SYS_ADMIN'])).toBe('/operations/dashboard');
    expect(defaultRouteForRoles(['MANAGEMENT'])).toBe('/operations/dashboard');
    expect(defaultRouteForRoles(['DISPATCHER'])).toBe('/operations/vehicle-confirmation');
    expect(defaultRouteForRoles(['CUSTOMS'])).toBe('/workflow/queue');
    expect(defaultRouteForRoles(['BORDER_GUARD'])).toBe('/workflow/queue');
    expect(defaultRouteForRoles(['QUARANTINE'])).toBe('/workflow/queue');
    expect(defaultRouteForRoles(['FEE_COLLECTOR'])).toBe('/fees/tax');
    expect(defaultRouteForRoles(['YARD_MANAGER'])).toBe('/operations/customs-b5');
    expect(defaultRouteForRoles(['ENTERPRISE'])).toBe('/declarations');
    expect(defaultRouteForRoles(['INDIVIDUAL'])).toBe('/declarations');
  });

  it('ưu tiên vai trò đầu tiên khớp trong danh sách nhiều vai trò', () => {
    expect(defaultRouteForRoles(['CUSTOMS', 'DECLARANT'])).toBe('/workflow/queue');
    expect(defaultRouteForRoles(['UNKNOWN_ROLE', 'DISPATCHER'])).toBe('/operations/vehicle-confirmation');
    expect(defaultRouteForRoles(['ENTERPRISE', 'SYS_ADMIN'])).toBe('/declarations');
  });

  it('fallback về /declarations khi danh sách vai trò rỗng và accountType là ENTERPRISE hoặc INDIVIDUAL', () => {
    expect(defaultRouteForRoles([], AccountType.ENTERPRISE)).toBe(FALLBACK_DECLARATION_ROUTE);
    expect(defaultRouteForRoles([], AccountType.INDIVIDUAL)).toBe(FALLBACK_DECLARATION_ROUTE);
    expect(defaultRouteForRoles(['UNKNOWN_ROLE'], AccountType.ENTERPRISE)).toBe(FALLBACK_DECLARATION_ROUTE);
  });

  it('fallback về /operations/dashboard khi danh sách vai trò rỗng hoặc không khớp và là tài khoản nội bộ (null/undefined)', () => {
    expect(defaultRouteForRoles([], null)).toBe(FALLBACK_OFFICER_ROUTE);
    expect(defaultRouteForRoles([])).toBe(FALLBACK_OFFICER_ROUTE);
    expect(defaultRouteForRoles(['UNKNOWN_CUSTOM_ROLE'], null)).toBe(FALLBACK_OFFICER_ROUTE);
  });

  it('khớp tất cả các mã vai trò trong ROUTE_BY_RBAC_ROLE', () => {
    for (const [roleCode, expectedRoute] of Object.entries(ROUTE_BY_RBAC_ROLE)) {
      expect(defaultRouteForRoles([roleCode])).toBe(expectedRoute);
    }
  });
});