import { PermissionActionCode, PermissionModuleCode, permissionCode } from './permission.catalog';

export interface MenuItemDefinition {
  code: string;
  label: string;
  icon: string;
  route: string;
  /** Quyền tối thiểu để mục menu hiển thị. */
  permission: string;
  sortOrder: number;
  /** Menu con (mockup MH13). Mục có `children` hiển thị dạng nhóm xổ được; mỗi con tự lọc theo quyền. */
  children?: MenuItemDefinition[];
}

/**
 * Cây menu chuẩn lấy theo mockup MH13 (điểm D4 của kế hoạch — chờ xác nhận cuối cùng).
 * Menu **suy ra từ quyền** thay vì lưu thành bảng riêng, lý do ghi trong `docs/ACCESS-CONTROL-ME.md`.
 */
export const MENU_CATALOG: MenuItemDefinition[] = [
  {
    code: 'overview',
    label: 'Tổng quan',
    icon: 'dashboard',
    route: '/operations/dashboard',
    permission: permissionCode(PermissionModuleCode.REPORT, PermissionActionCode.VIEW),
    sortOrder: 1,
  },
  {
    code: 'dossier',
    label: 'Hồ sơ',
    icon: 'description',
    // Mục phẳng (theo template menu-sidebar): mở thẳng danh sách hồ sơ. F07–F17
    // (DN/lái xe/phương tiện/hàng hóa/chứng từ/lịch/kiểm tra đầy đủ) là các phần TRONG
    // luồng khai báo, không phải màn riêng — nên không tách thành mục menu con.
    route: '/declarations',
    permission: permissionCode(PermissionModuleCode.DOSSIER, PermissionActionCode.VIEW),
    sortOrder: 2,
  },
  {
    // Hàng đợi liên ngành UI-06 (P3). Màn hình xử lý UI-07 (`/workflow/dossiers/:id`) vào bằng cách
    // bấm một dòng trong hàng đợi nên cố ý **không** có mục menu riêng — route có tham số `:id`.
    // Hàng đợi phương tiện/số thứ tự (queue.view, P4) KHÔNG còn là mục menu riêng theo mẫu
    // `menu-sidebar.html` — route `/operations/by-role` vẫn tồn tại, vào từ màn Điều phối.
    code: 'workflow',
    label: 'Xử lý liên ngành',
    icon: 'fact_check',
    route: '/workflow/queue',
    permission: permissionCode(PermissionModuleCode.WORKFLOW, PermissionActionCode.VIEW),
    sortOrder: 3,
  },
  {
    code: 'dispatch',
    label: 'Điều phối',
    icon: 'alt_route',
    route: '/operations/vehicle-confirmation',
    permission: permissionCode(PermissionModuleCode.DISPATCH, PermissionActionCode.VIEW),
    sortOrder: 4,
  },
  {
    code: 'gate',
    label: 'Cổng vào/ra',
    icon: 'qr_code_scanner',
    route: '/operations/vehicles-entered-gate',
    permission: permissionCode(PermissionModuleCode.GATE, PermissionActionCode.VIEW),
    sortOrder: 5,
  },
  {
    code: 'yard',
    label: 'Kho bãi',
    icon: 'warehouse',
    // Nhóm xổ ra sơ đồ bãi (vận hành) + cấu hình khu/sức chứa (quản trị). Route trỏ mục con đầu.
    route: '/operations/customs-b5',
    permission: permissionCode(PermissionModuleCode.YARD, PermissionActionCode.VIEW),
    sortOrder: 6,
    children: [
      {
        code: 'yard-map',
        label: 'Sơ đồ bãi',
        icon: 'grid_view',
        route: '/operations/customs-b5',
        permission: permissionCode(PermissionModuleCode.YARD, PermissionActionCode.VIEW),
        sortOrder: 1,
      },
      {
        code: 'yard-config',
        label: 'Cấu hình bãi',
        icon: 'tune',
        route: '/yard/config',
        permission: permissionCode(PermissionModuleCode.YARD, PermissionActionCode.APPROVE),
        sortOrder: 2,
      },
    ],
  },
  {
    code: 'fee',
    label: 'Thu phí',
    icon: 'payments',
    // Nhóm xổ ra màn thu phí (vận hành) + Quản trị biểu phí (F46, quyền duyệt phí). Route trỏ mục con đầu.
    route: '/fees/tax',
    permission: permissionCode(PermissionModuleCode.FEE, PermissionActionCode.VIEW),
    sortOrder: 7,
    children: [
      {
        code: 'fee-collect',
        label: 'Thu phí tờ khai',
        icon: 'payments',
        route: '/fees/tax',
        permission: permissionCode(PermissionModuleCode.FEE, PermissionActionCode.VIEW),
        sortOrder: 1,
      },
      {
        code: 'fee-rules',
        label: 'Quản trị biểu phí',
        icon: 'request_quote',
        route: '/fees/rules',
        permission: permissionCode(PermissionModuleCode.FEE, PermissionActionCode.APPROVE),
        sortOrder: 2,
      },
    ],
  },
  {
    code: 'report',
    label: 'Báo cáo',
    icon: 'insights',
    route: '/reports/general',
    permission: permissionCode(PermissionModuleCode.REPORT, PermissionActionCode.VIEW),
    sortOrder: 8,
  },
  {
    code: 'catalog',
    label: 'Danh mục',
    icon: 'list_alt',
    route: '/admin/catalog',
    permission: permissionCode(PermissionModuleCode.CATALOG, PermissionActionCode.VIEW),
    sortOrder: 9,
  },
  {
    code: 'system',
    label: 'Quản trị và cấu hình',
    icon: 'settings',
    // Nhóm quản trị nền tảng (mockup MH13). Bấm nhóm sẽ xổ ra các mục con; route trỏ mục con đầu.
    route: '/admin/users',
    permission: permissionCode(PermissionModuleCode.SYSTEM, PermissionActionCode.VIEW),
    sortOrder: 10,
    children: [
      {
        code: 'system-users',
        label: 'Quản lý người dùng',
        icon: 'manage_accounts',
        route: '/admin/users',
        permission: permissionCode(PermissionModuleCode.SYSTEM, PermissionActionCode.VIEW),
        sortOrder: 1,
      },
      {
        code: 'system-roles',
        label: 'Phân quyền vai trò',
        icon: 'admin_panel_settings',
        route: '/admin/roles',
        permission: permissionCode(PermissionModuleCode.SYSTEM, PermissionActionCode.VIEW),
        sortOrder: 2,
      },
      {
        code: 'system-audit',
        label: 'Nhật ký thao tác',
        icon: 'receipt_long',
        route: '/admin/audit',
        permission: permissionCode(PermissionModuleCode.SYSTEM, PermissionActionCode.VIEW),
        sortOrder: 3,
      },
      {
        // BA-092: màn "Cấu hình hệ thống" — 4 mockup (user/role/account/activity-log) có mục
        // "Cấu hình chung"; chủ dự án chốt đưa vào. Hiển thị theo `system.view`, chỉ SYS_ADMIN thấy.
        code: 'system-config',
        label: 'Cấu hình chung',
        icon: 'tune',
        route: '/admin/system-config',
        permission: permissionCode(PermissionModuleCode.SYSTEM, PermissionActionCode.VIEW),
        sortOrder: 4,
      },
    ],
  },
];
