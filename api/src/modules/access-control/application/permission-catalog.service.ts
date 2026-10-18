import { Injectable } from '@nestjs/common';

export interface NavigationItemDto {
  group: string;
  label: string;
  route: string;
  roles: string[];
}

/**
 * Mã vai trò RBAC từ `role.catalog.ts`. Thay thế mã legacy theo bước (HQ_B1, BP_B1...) bằng mã
 * vai trò thống nhất: CUSTOMS, BORDER_GUARD, QUARANTINE... — một người/vai trò xử lý mọi bước.
 */
const ROLE = {
  ADMIN: 'ADMIN',
  OPS: 'OPS',
  ENTERPRISE: 'DN',
  DRIVER: 'DRIVER',
  CUSTOMS: 'CUSTOMS',
  BORDER_GUARD: 'BORDER_GUARD',
  QUARANTINE: 'QUARANTINE',
  FEE_COLLECTOR: 'FEE_COLLECTOR',
  DISPATCHER: 'DISPATCHER',
  YARD_MANAGER: 'YARD_MANAGER',
  MANAGEMENT: 'MANAGEMENT',
} as const;

const STAFF_ROLES: string[] = [
  ROLE.CUSTOMS,
  ROLE.BORDER_GUARD,
  ROLE.QUARANTINE,
];

const DECLARATION_ROLES: string[] = [ROLE.ADMIN, ROLE.OPS, ROLE.ENTERPRISE, ...STAFF_ROLES];
const LLCN_REPORT_ROLES: string[] = [ROLE.ADMIN, ROLE.OPS, ...STAFF_ROLES, ROLE.FEE_COLLECTOR, ROLE.MANAGEMENT];

@Injectable()
export class PermissionCatalogService {
  private readonly navigation: NavigationItemDto[] = [
    { group: 'Tổng quan', label: 'Tổng quan', route: '/operations/dashboard', roles: [ROLE.ADMIN, ROLE.OPS] },
    { group: 'Nghiệp vụ', label: 'Quản lý xe không', route: '/operations/empty-vehicle', roles: [ROLE.ADMIN, ROLE.OPS] },
    { group: 'Nghiệp vụ', label: 'Bản khai thông tin', route: '/declarations', roles: DECLARATION_ROLES },
    { group: 'Nghiệp vụ', label: 'Tạo hồ sơ lái xe', route: '/declarations/new', roles: [ROLE.DRIVER] },
    { group: 'Nghiệp vụ', label: 'Bản khai theo chức danh', route: '/operations/by-role', roles: STAFF_ROLES },
    { group: 'Nghiệp vụ', label: 'Xác nhận xe', route: '/operations/vehicle-confirmation', roles: [ROLE.ADMIN, ROLE.OPS] },
    { group: 'Nghiệp vụ', label: 'Thủ tục tờ khai', route: '/operations/declaration-procedures', roles: [ROLE.ADMIN, ROLE.OPS, ROLE.CUSTOMS] },
    { group: 'Nghiệp vụ', label: 'Đăng ký sang tải', route: '/operations/transshipment-registration', roles: [ROLE.ADMIN, ROLE.OPS, ROLE.CUSTOMS] },
    { group: 'Nghiệp vụ', label: 'Xe vào cửa khẩu', route: '/operations/vehicles-entered-gate', roles: [ROLE.ADMIN, ROLE.OPS] },
    { group: 'Nghiệp vụ', label: 'Theo dõi hành trình xe', route: '/operations/vehicle-tracking', roles: [ROLE.ADMIN, ROLE.OPS, ROLE.DRIVER] },
    { group: 'Nghiệp vụ', label: 'Hải quan B5', route: '/operations/customs-b5', roles: [ROLE.ADMIN, ROLE.OPS, ROLE.CUSTOMS] },
    { group: 'Nghiệp vụ', label: 'Thu phí hạ tầng', route: '/fees/tax', roles: [ROLE.ADMIN, ROLE.OPS, ROLE.FEE_COLLECTOR] },
    { group: 'Nghiệp vụ', label: 'Thu phí sang tải', route: '/fees/economic-zone', roles: [ROLE.ADMIN, ROLE.OPS, ROLE.FEE_COLLECTOR] },
    { group: 'Báo cáo', label: 'Báo cáo tổng hợp', route: '/reports/general', roles: [ROLE.ADMIN, ROLE.OPS] },
    { group: 'Báo cáo', label: 'Báo cáo Hải quan', route: '/reports/customs', roles: [ROLE.ADMIN, ROLE.OPS, ROLE.CUSTOMS] },
    { group: 'Báo cáo', label: 'Thống kê Biên phòng', route: '/reports/border-statistics', roles: [ROLE.ADMIN, ROLE.OPS, ROLE.BORDER_GUARD] },
    { group: 'Báo cáo', label: 'Báo cáo Biên phòng', route: '/reports/border', roles: [ROLE.ADMIN, ROLE.OPS, ROLE.BORDER_GUARD] },
    { group: 'Báo cáo', label: 'Thời gian LLCN xác nhận', route: '/reports/llcn-time', roles: LLCN_REPORT_ROLES },
    { group: 'Quản trị', label: 'Người dùng & phân quyền', route: '/admin/users', roles: [ROLE.ADMIN] },
  ];

  listNavigation(role?: string): NavigationItemDto[] {
    return role ? this.navigation.filter((item) => item.roles.includes(role)) : this.navigation;
  }

  permissions(role: string) {
    return {
      role,
      routes: this.listNavigation(role).map((item) => item.route),
      canManageUsers: role === ROLE.ADMIN,
      canOperateDashboard: ([ROLE.ADMIN, ROLE.OPS] as string[]).includes(role),
      canCreateDeclaration: ([ROLE.ADMIN, ROLE.OPS, ROLE.ENTERPRISE, ROLE.DRIVER] as string[]).includes(role),
      canDeleteDeclaration: ([ROLE.ADMIN, ROLE.OPS, ROLE.ENTERPRISE] as string[]).includes(role),
      canRequestRevision: ([ROLE.ADMIN, ROLE.OPS, ...STAFF_ROLES] as string[]).includes(role),
      canConfirmForce: STAFF_ROLES.includes(role),
      canCollectFee: ([ROLE.ADMIN, ROLE.OPS, ROLE.FEE_COLLECTOR] as string[]).includes(role),
    };
  }
}
