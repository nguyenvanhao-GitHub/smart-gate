/**
 * Mô hình quyền = Phân hệ × Hành động (kế hoạch MVP mục 3.1).
 * 10 phân hệ × 6 hành động = 60 mã quyền dạng `<module>.<action>`.
 * Đây là danh mục cố định, được seed xuống bảng `permissions` và dùng cho ma trận phân quyền UI-13.
 */
export enum PermissionModuleCode {
  DOSSIER = 'dossier',
  QUEUE = 'queue',
  WORKFLOW = 'workflow',
  DISPATCH = 'dispatch',
  GATE = 'gate',
  YARD = 'yard',
  FEE = 'fee',
  REPORT = 'report',
  CATALOG = 'catalog',
  SYSTEM = 'system',
}

export enum PermissionActionCode {
  VIEW = 'view',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  APPROVE = 'approve',
  EXPORT = 'export',
}

export const PERMISSION_MODULE_LABELS: Record<PermissionModuleCode, string> = {
  [PermissionModuleCode.DOSSIER]: 'Hồ sơ',
  [PermissionModuleCode.QUEUE]: 'Hàng đợi',
  [PermissionModuleCode.WORKFLOW]: 'Xử lý liên ngành',
  [PermissionModuleCode.DISPATCH]: 'Điều phối phương tiện',
  [PermissionModuleCode.GATE]: 'Cổng QR',
  [PermissionModuleCode.YARD]: 'Kho bãi',
  [PermissionModuleCode.FEE]: 'Thu phí',
  [PermissionModuleCode.REPORT]: 'Báo cáo',
  [PermissionModuleCode.CATALOG]: 'Danh mục',
  [PermissionModuleCode.SYSTEM]: 'Hệ thống',
};

export const PERMISSION_ACTION_LABELS: Record<PermissionActionCode, string> = {
  [PermissionActionCode.VIEW]: 'Xem',
  [PermissionActionCode.CREATE]: 'Thêm',
  [PermissionActionCode.UPDATE]: 'Sửa',
  [PermissionActionCode.DELETE]: 'Xóa',
  [PermissionActionCode.APPROVE]: 'Duyệt',
  [PermissionActionCode.EXPORT]: 'Xuất',
};

/** Thứ tự hiển thị cột trong ma trận phân quyền. */
export const PERMISSION_MODULE_ORDER: PermissionModuleCode[] = [
  PermissionModuleCode.DOSSIER,
  PermissionModuleCode.QUEUE,
  PermissionModuleCode.WORKFLOW,
  PermissionModuleCode.DISPATCH,
  PermissionModuleCode.GATE,
  PermissionModuleCode.YARD,
  PermissionModuleCode.FEE,
  PermissionModuleCode.REPORT,
  PermissionModuleCode.CATALOG,
  PermissionModuleCode.SYSTEM,
];

export const PERMISSION_ACTION_ORDER: PermissionActionCode[] = [
  PermissionActionCode.VIEW,
  PermissionActionCode.CREATE,
  PermissionActionCode.UPDATE,
  PermissionActionCode.DELETE,
  PermissionActionCode.APPROVE,
  PermissionActionCode.EXPORT,
];

export interface PermissionDefinition {
  code: string;
  module: PermissionModuleCode;
  moduleLabel: string;
  action: PermissionActionCode;
  actionLabel: string;
  /** Nhãn tiếng Việt đầy đủ hiển thị trên ma trận phân quyền. */
  name: string;
  sortOrder: number;
}

export function permissionCode(module: PermissionModuleCode, action: PermissionActionCode): string {
  return `${module}.${action}`;
}

function buildCatalog(): PermissionDefinition[] {
  const items: PermissionDefinition[] = [];
  PERMISSION_MODULE_ORDER.forEach((module, moduleIndex) => {
    PERMISSION_ACTION_ORDER.forEach((action, actionIndex) => {
      items.push({
        code: permissionCode(module, action),
        module,
        moduleLabel: PERMISSION_MODULE_LABELS[module],
        action,
        actionLabel: PERMISSION_ACTION_LABELS[action],
        name: `${PERMISSION_ACTION_LABELS[action]} ${PERMISSION_MODULE_LABELS[module].toLowerCase()}`,
        sortOrder: moduleIndex * PERMISSION_ACTION_ORDER.length + actionIndex,
      });
    });
  });
  return items;
}

export const PERMISSION_CATALOG: PermissionDefinition[] = buildCatalog();

export const PERMISSION_CODES: string[] = PERMISSION_CATALOG.map((item) => item.code);
