import {
  PERMISSION_MODULE_ORDER,
  PermissionActionCode,
  PermissionModuleCode,
  permissionCode,
} from './permission.catalog';

/**
 * Mức quyền theo ma trận SRS mục 3.2:
 * M – quản trị · A – phê duyệt/xác nhận · W – tạo/cập nhật · R – xem · "-" – không có quyền.
 */
export enum ModuleAccessLevel {
  NONE = '-',
  READ = 'R',
  WRITE = 'W',
  APPROVE = 'A',
  MANAGE = 'M',
}

/**
 * Quy đổi mức quyền sang tập hành động (lũy tiến: M ⊃ A ⊃ W ⊃ R).
 * R chỉ được xem; từ W trở lên mới được xuất dữ liệu ra ngoài.
 */
export const LEVEL_ACTIONS: Record<ModuleAccessLevel, PermissionActionCode[]> = {
  [ModuleAccessLevel.NONE]: [],
  [ModuleAccessLevel.READ]: [PermissionActionCode.VIEW],
  [ModuleAccessLevel.WRITE]: [
    PermissionActionCode.VIEW,
    PermissionActionCode.CREATE,
    PermissionActionCode.UPDATE,
    PermissionActionCode.EXPORT,
  ],
  [ModuleAccessLevel.APPROVE]: [
    PermissionActionCode.VIEW,
    PermissionActionCode.CREATE,
    PermissionActionCode.UPDATE,
    PermissionActionCode.APPROVE,
    PermissionActionCode.EXPORT,
  ],
  [ModuleAccessLevel.MANAGE]: [
    PermissionActionCode.VIEW,
    PermissionActionCode.CREATE,
    PermissionActionCode.UPDATE,
    PermissionActionCode.DELETE,
    PermissionActionCode.APPROVE,
    PermissionActionCode.EXPORT,
  ],
};

export interface RoleDefinition {
  code: string;
  name: string;
  description: string;
  /** Vai trò hệ thống thì không cho xóa trên màn quản trị. */
  isSystem: boolean;
  matrix: Partial<Record<PermissionModuleCode, ModuleAccessLevel>>;
  /** Quyền cấp thêm ngoài ma trận — mọi trường hợp đều ghi rõ lý do trong docs/ROLE-MAPPING.md. */
  extraPermissions?: string[];
}

const ALL_MANAGE: Record<PermissionModuleCode, ModuleAccessLevel> = PERMISSION_MODULE_ORDER.reduce(
  (acc, module) => ({ ...acc, [module]: ModuleAccessLevel.MANAGE }),
  {} as Record<PermissionModuleCode, ModuleAccessLevel>,
);

/** Mọi vai trò đều cần đọc danh mục dùng chung để dựng bộ lọc/dropdown trên giao diện. */
const CATALOG_VIEW = permissionCode(PermissionModuleCode.CATALOG, PermissionActionCode.VIEW);

/** Các nhóm vai trò hệ thống theo SRS mục 3.1 và loại tài khoản ngoài hệ thống. */
export const ROLE_CATALOG: RoleDefinition[] = [
  {
    code: 'SYS_ADMIN',
    name: 'Quản trị hệ thống',
    description: 'Quản lý người dùng, đơn vị, vai trò, danh mục và cấu hình.',
    isSystem: true,
    matrix: ALL_MANAGE,
  },
  {
    code: 'ENTERPRISE',
    name: 'Doanh nghiệp/Logistics',
    description: 'Khai báo, gửi, bổ sung và theo dõi hồ sơ; nhận lịch, số và thông báo.',
    isSystem: true,
    // BUG-032/BUG-015: doanh nghiệp CHỈ thao tác hồ sơ của chính mình (data_scope = OWN theo seed).
    // KHÔNG cấp bất kỳ phân hệ liên ngành/hàng đợi/điều phối/cổng/kho bãi/thu phí/báo cáo/danh mục/hệ
    // thống nào — các màn đó vừa bị ẩn khỏi menu (menu suy ra từ quyền) vừa bị PermissionsGuard chặn 403.
    // Theo SRS: DN = khai báo/gửi/bổ sung/theo dõi hồ sơ + nhận lịch/số/thông báo. Thông báo và hồ sơ
    // cá nhân đi qua @AuthenticatedOnly nên không cần mã quyền riêng.
    matrix: {
      [PermissionModuleCode.DOSSIER]: ModuleAccessLevel.WRITE,
    },
    // Giữ hành vi cũ: doanh nghiệp/tài xế được hủy và xóa hồ sơ của chính mình (giới hạn bởi data_scope = OWN).
    extraPermissions: [permissionCode(PermissionModuleCode.DOSSIER, PermissionActionCode.DELETE)],
  },
  {
    code: 'INDIVIDUAL',
    name: 'Cá nhân',
    description: 'Khai báo, gửi, bổ sung và theo dõi hồ sơ cá nhân của chính mình.',
    isSystem: true,
    matrix: {
      [PermissionModuleCode.DOSSIER]: ModuleAccessLevel.WRITE,
    },
    extraPermissions: [permissionCode(PermissionModuleCode.DOSSIER, PermissionActionCode.DELETE)],
  },
  {
    code: 'BORDER_GUARD',
    name: 'Biên phòng',
    description: 'Kiểm tra an ninh, người/phương tiện, giấy tờ và xác nhận nhập/xuất cảnh.',
    isSystem: true,
    matrix: {
      [PermissionModuleCode.DOSSIER]: ModuleAccessLevel.READ,
      [PermissionModuleCode.QUEUE]: ModuleAccessLevel.APPROVE,
      [PermissionModuleCode.WORKFLOW]: ModuleAccessLevel.APPROVE,
      [PermissionModuleCode.DISPATCH]: ModuleAccessLevel.READ,
      [PermissionModuleCode.GATE]: ModuleAccessLevel.APPROVE,
      [PermissionModuleCode.YARD]: ModuleAccessLevel.READ,
      [PermissionModuleCode.FEE]: ModuleAccessLevel.READ,
      [PermissionModuleCode.REPORT]: ModuleAccessLevel.READ,
    },
    extraPermissions: [CATALOG_VIEW],
  },
  {
    code: 'CUSTOMS',
    name: 'Hải quan',
    description: 'Kiểm tra tờ khai, hành lý/hàng hóa và chứng từ hải quan.',
    isSystem: true,
    matrix: {
      [PermissionModuleCode.DOSSIER]: ModuleAccessLevel.READ,
      [PermissionModuleCode.QUEUE]: ModuleAccessLevel.APPROVE,
      [PermissionModuleCode.WORKFLOW]: ModuleAccessLevel.APPROVE,
      [PermissionModuleCode.DISPATCH]: ModuleAccessLevel.READ,
      [PermissionModuleCode.GATE]: ModuleAccessLevel.READ,
      [PermissionModuleCode.YARD]: ModuleAccessLevel.READ,
      [PermissionModuleCode.FEE]: ModuleAccessLevel.READ,
      [PermissionModuleCode.REPORT]: ModuleAccessLevel.READ,
    },
    extraPermissions: [CATALOG_VIEW],
  },
  {
    code: 'QUARANTINE',
    name: 'Kiểm dịch',
    description: 'Kiểm tra y tế/dịch tễ, kiểm dịch thực vật và động vật khi áp dụng.',
    isSystem: true,
    matrix: {
      [PermissionModuleCode.DOSSIER]: ModuleAccessLevel.READ,
      [PermissionModuleCode.QUEUE]: ModuleAccessLevel.APPROVE,
      [PermissionModuleCode.WORKFLOW]: ModuleAccessLevel.APPROVE,
      [PermissionModuleCode.DISPATCH]: ModuleAccessLevel.READ,
      [PermissionModuleCode.GATE]: ModuleAccessLevel.READ,
      [PermissionModuleCode.YARD]: ModuleAccessLevel.READ,
      [PermissionModuleCode.FEE]: ModuleAccessLevel.READ,
      [PermissionModuleCode.REPORT]: ModuleAccessLevel.READ,
    },
    extraPermissions: [CATALOG_VIEW],
  },
  {
    code: 'DISPATCHER',
    name: 'Điều phối viên',
    description: 'Cấp/điều chỉnh lịch, số thứ tự, cổng, làn, bãi và ưu tiên.',
    isSystem: true,
    matrix: {
      [PermissionModuleCode.DOSSIER]: ModuleAccessLevel.READ,
      // P4: nâng từ `R` lên `M`. Chính mô tả vai trò ở trên nói "Cấp/điều chỉnh lịch, **số thứ
      // tự**…", mà mức `R` thì không có `queue.create` nên điều phối viên không cấp nổi số (F27).
      [PermissionModuleCode.QUEUE]: ModuleAccessLevel.MANAGE,
      [PermissionModuleCode.WORKFLOW]: ModuleAccessLevel.READ,
      [PermissionModuleCode.DISPATCH]: ModuleAccessLevel.MANAGE,
      [PermissionModuleCode.GATE]: ModuleAccessLevel.READ,
      [PermissionModuleCode.YARD]: ModuleAccessLevel.WRITE,
      [PermissionModuleCode.FEE]: ModuleAccessLevel.READ,
      [PermissionModuleCode.REPORT]: ModuleAccessLevel.READ,
    },
    // Giữ hành vi cũ của vai trò OPS: điều phối viên được chạy tác vụ trên màn tác nghiệp liên ngành.
    extraPermissions: [CATALOG_VIEW, permissionCode(PermissionModuleCode.WORKFLOW, PermissionActionCode.APPROVE)],
  },
  {
    code: 'YARD_MANAGER',
    name: 'Quản lý bãi',
    description: 'Quản lý sức chứa, vị trí và trạng thái kiểm tra/tập kết.',
    isSystem: true,
    matrix: {
      [PermissionModuleCode.DOSSIER]: ModuleAccessLevel.READ,
      [PermissionModuleCode.QUEUE]: ModuleAccessLevel.READ,
      [PermissionModuleCode.WORKFLOW]: ModuleAccessLevel.READ,
      [PermissionModuleCode.DISPATCH]: ModuleAccessLevel.WRITE,
      [PermissionModuleCode.GATE]: ModuleAccessLevel.READ,
      // SRS 3.1 giao hẳn kho bãi cho vai trò này nên nâng lên mức quản trị phân hệ kho bãi.
      [PermissionModuleCode.YARD]: ModuleAccessLevel.MANAGE,
      [PermissionModuleCode.REPORT]: ModuleAccessLevel.READ,
    },
    extraPermissions: [CATALOG_VIEW],
  },
  {
    code: 'FEE_COLLECTOR',
    name: 'Cơ quan thu phí',
    description: 'Tính/điều chỉnh phí, xác nhận thanh toán và đối soát.',
    isSystem: true,
    matrix: {
      [PermissionModuleCode.DOSSIER]: ModuleAccessLevel.READ,
      [PermissionModuleCode.QUEUE]: ModuleAccessLevel.READ,
      [PermissionModuleCode.WORKFLOW]: ModuleAccessLevel.READ,
      [PermissionModuleCode.DISPATCH]: ModuleAccessLevel.READ,
      [PermissionModuleCode.GATE]: ModuleAccessLevel.READ,
      [PermissionModuleCode.YARD]: ModuleAccessLevel.READ,
      [PermissionModuleCode.FEE]: ModuleAccessLevel.APPROVE,
      [PermissionModuleCode.REPORT]: ModuleAccessLevel.READ,
    },
    // CR — lệch nhẹ so với ma trận SRS mục 3.2 (FEE_COLLECTOR ở phân hệ "Xử lý liên ngành" = R).
    // Bước thu phí (EXPORT_FEE/IMPORT_FEE trong workflow_step_roles) được giao cho FEE_COLLECTOR,
    // nhưng mức R chỉ có `workflow.view` nên `availableDecisions()` trả rỗng — cán bộ thu phí không
    // đẩy được chính bước của mình (chỉ `dieuphoi` kiêm DISPATCHER làm thay được). Cấp thêm
    // `workflow.approve` + `workflow.update` để họ hoàn tất bước thu phí (APPROVE/REQUEST_SUPPLEMENT/
    // REJECT/FORWARD). `WorkflowRoute.allowsRole` đã khóa FEE_COLLECTOR chỉ vào bước `*_FEE` nên họ
    // KHÔNG chạm được bước của lực lượng khác. Phần "đúng SRS" (F48 — vai trò tự đẩy bước) để Giai đoạn 2.
    extraPermissions: [
      CATALOG_VIEW,
      permissionCode(PermissionModuleCode.WORKFLOW, PermissionActionCode.APPROVE),
      permissionCode(PermissionModuleCode.WORKFLOW, PermissionActionCode.UPDATE),
    ],
  },
  {
    code: 'MANAGEMENT',
    name: 'Ban quản lý/Lãnh đạo',
    description: 'Theo dõi dashboard, báo cáo và điều hành tổng thể.',
    isSystem: true,
    matrix: {
      [PermissionModuleCode.DOSSIER]: ModuleAccessLevel.READ,
      [PermissionModuleCode.QUEUE]: ModuleAccessLevel.READ,
      [PermissionModuleCode.WORKFLOW]: ModuleAccessLevel.READ,
      [PermissionModuleCode.DISPATCH]: ModuleAccessLevel.READ,
      [PermissionModuleCode.GATE]: ModuleAccessLevel.READ,
      [PermissionModuleCode.YARD]: ModuleAccessLevel.READ,
      [PermissionModuleCode.FEE]: ModuleAccessLevel.READ,
      [PermissionModuleCode.REPORT]: ModuleAccessLevel.MANAGE,
    },
    extraPermissions: [CATALOG_VIEW],
  },
];

/** Bung một dòng ma trận thành danh sách mã quyền, đã loại trùng và sắp xếp ổn định. */
export function permissionsForRole(definition: RoleDefinition): string[] {
  const codes = new Set<string>(definition.extraPermissions || []);
  for (const [module, level] of Object.entries(definition.matrix)) {
    for (const action of LEVEL_ACTIONS[level]) {
      codes.add(permissionCode(module as PermissionModuleCode, action));
    }
  }
  return [...codes].sort();
}

export function findRoleDefinition(code: string): RoleDefinition | undefined {
  return ROLE_CATALOG.find((role) => role.code === code);
}

/** Mã vai trò siêu quản trị — vai trò duy nhất được cấp toàn bộ quyền quản trị hệ thống. */
export const SYS_ADMIN_ROLE_CODE = 'SYS_ADMIN';

/**
 * Bộ quyền quản trị cốt lõi mà vai trò `SYS_ADMIN` **bắt buộc giữ** (BUG-059): thiếu bất kỳ mã nào
 * thì không còn ai quản trị nổi vai trò/người dùng nữa (khóa cứng toàn hệ thống). Bốn mã này chính là
 * quyền gác các endpoint quản trị vai trò/người dùng (`system.view/create/update/delete`).
 */
export const SYS_ADMIN_CORE_PERMISSIONS: string[] = [
  permissionCode(PermissionModuleCode.SYSTEM, PermissionActionCode.VIEW),
  permissionCode(PermissionModuleCode.SYSTEM, PermissionActionCode.CREATE),
  permissionCode(PermissionModuleCode.SYSTEM, PermissionActionCode.UPDATE),
  permissionCode(PermissionModuleCode.SYSTEM, PermissionActionCode.DELETE),
];
