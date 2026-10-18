// =============================================================================
// Mô hình phân quyền động (RBAC lấy từ API) — thay cho `role-access.model.ts` cũ.
//
// Nguyên tắc: FE KHÔNG biết trước có những vai trò nào. Vai trò, quyền, menu và
// phạm vi dữ liệu đều là dữ liệu do `GET /access-control/me` trả về.
// FE chỉ biết *mã quyền* nào cần cho từng route/nút — xem hằng `PERMISSION`.
// =============================================================================

import { MessageKey } from '../i18n/message-catalog';
import { Translate, translateCode, translateLabel } from '../models/label.util';

/** Phạm vi dữ liệu gắn trên từng vai trò của người dùng (kế hoạch MVP mục 3.1). */
export type DataScope = 'ALL' | 'ORGANIZATION' | 'OWN' | 'ASSIGNMENT';

export const DATA_SCOPE_LABEL_KEYS: Record<DataScope, MessageKey> = {
  ALL: 'ui.scope.ALL',
  ORGANIZATION: 'ui.scope.ORGANIZATION',
  OWN: 'ui.scope.OWN',
  ASSIGNMENT: 'ui.scope.ASSIGNMENT',
};

/** `scope` khai kiểu `string` chứ không phải `DataScope`: API có thể thêm phạm vi mới mà web chưa
 *  biết, và nhánh dự phòng bên dưới đã lo đúng ca đó. */
export function dataScopeLabel(scope: string, t?: Translate): string {
  const key = DATA_SCOPE_LABEL_KEYS[scope as DataScope];
  return key ? translateLabel(key, t) : String(scope || '');
}

/**
 * Nhãn vai trò cho cột "Người xác nhận" của nhật ký/kiểm toán — đây là NHÃN hiển thị, KHÔNG phải
 * căn cứ phân quyền (RBAC vẫn hoàn toàn động). Các mã seed ở `access-control/domain/role.catalog.ts`;
 * mã động lạ ngoài danh mục rơi về chính mã đó.
 */
export const ROLE_LABEL_KEYS: Record<string, MessageKey> = {
  SYS_ADMIN: 'ui.role.SYS_ADMIN',
  ENTERPRISE: 'ui.role.ENTERPRISE',
  INDIVIDUAL: 'ui.role.INDIVIDUAL',
  BORDER_GUARD: 'ui.role.BORDER_GUARD',
  CUSTOMS: 'ui.role.CUSTOMS',
  QUARANTINE: 'ui.role.QUARANTINE',
  DISPATCHER: 'ui.role.DISPATCHER',
  YARD_MANAGER: 'ui.role.YARD_MANAGER',
  FEE_COLLECTOR: 'ui.role.FEE_COLLECTOR',
  GATE_OFFICER: 'ui.role.GATE_OFFICER',
  MANAGEMENT: 'ui.role.MANAGEMENT',
};

/**
 * Mã dịch mô tả vai trò — tra theo mã ASCII vai trò hệ thống.
 */
export const ROLE_DESC_KEYS: Record<string, MessageKey> = {
  SYS_ADMIN: 'ui.roleDesc.SYS_ADMIN',
  ENTERPRISE: 'ui.roleDesc.ENTERPRISE',
  INDIVIDUAL: 'ui.roleDesc.INDIVIDUAL',
  BORDER_GUARD: 'ui.roleDesc.BORDER_GUARD',
  CUSTOMS: 'ui.roleDesc.CUSTOMS',
  QUARANTINE: 'ui.roleDesc.QUARANTINE',
  DISPATCHER: 'ui.roleDesc.DISPATCHER',
  YARD_MANAGER: 'ui.roleDesc.YARD_MANAGER',
  FEE_COLLECTOR: 'ui.roleDesc.FEE_COLLECTOR',
  GATE_OFFICER: 'ui.roleDesc.GATE_OFFICER',
  MANAGEMENT: 'ui.roleDesc.MANAGEMENT',
};

/**
 * Dịch `actorRole` sang nhãn hiển thị. Ảnh chụp kiểm toán có thể nối nhiều mã vai trò bằng '+'
 * (một người nhiều vai trò) — tách rồi dịch từng mã. Rỗng → '' để nơi gọi tự thay bằng "Hệ thống".
 */
export function actorRoleLabel(actorRole: string | null | undefined, t?: Translate): string {
  if (!actorRole) return '';
  return actorRole
    .split('+')
    .map((code) => code.trim())
    .filter((code) => code.length > 0)
    .map((code) => translateCode(ROLE_LABEL_KEYS[code], code, t))
    .join(' + ');
}

export interface AccessOrganization {
  id: string;
  code: string;
  name: string;
}

export interface AccessUser {
  id: string;
  username: string;
  displayName: string;
  title: string;
  email: string | null;
  phone: string | null;
  avatarUrl?: string | null;
  /** Địa chỉ liên hệ (DN/cá nhân); tài khoản nội bộ hoặc bản ghi cũ có thể trống. */
  address?: string | null;
  /** Loại tài khoản tự đăng ký (F00): `ENTERPRISE`/`INDIVIDUAL`; tài khoản nội bộ là `null`. */
  accountType?: string | null;
  /** Mã số thuế — chỉ tài khoản doanh nghiệp có (BUG-024: tự điền + khóa khi khai hồ sơ). */
  taxCode?: string | null;
  /** Số CCCD/hộ chiếu — chỉ tài khoản cá nhân có. */
  idNumber?: string | null;
  /** Người đại diện — chỉ tài khoản doanh nghiệp có. */
  representativeName?: string | null;
  isProtected?: boolean;
  status: 'ACTIVE' | 'LOCKED';
  organization: AccessOrganization | null;
}

export interface AccessRole {
  code: string;
  name: string;
  dataScope: DataScope;
}

/** Phạm vi làm việc được phân công: cửa khẩu, chốt, cổng, bãi... */
export interface AccessAssignment {
  type: string;
  code: string;
  name: string;
}

export interface MenuItem {
  key: string;
  label: string;
  icon: string;
  route: string;
  children?: MenuItem[];
}

/** Kết quả `GET /access-control/me`. */
export interface AccessProfile {
  user: AccessUser;
  roles: AccessRole[];
  permissions: string[];
  assignments: AccessAssignment[];
  menu: MenuItem[];
}

/**
 * Mã quyền FE tham chiếu (khai trên `route.data.permission` và `*hasPermission`).
 * Danh mục đầy đủ 10 phân hệ × 6 hành động do API cấp qua `GET /access-control/permissions`;
 * ở đây chỉ liệt kê những mã FE thực sự dùng để không phải viết chuỗi rời rạc.
 */
export const PERMISSION = {
  dossierView: 'dossier.view',
  dossierCreate: 'dossier.create',
  dossierUpdate: 'dossier.update',
  dossierDelete: 'dossier.delete',
  dossierApprove: 'dossier.approve',
  dossierExport: 'dossier.export',
  workflowView: 'workflow.view',
  workflowUpdate: 'workflow.update',
  workflowApprove: 'workflow.approve',
  queueView: 'queue.view',
  queueCreate: 'queue.create',
  dispatchView: 'dispatch.view',
  dispatchCreate: 'dispatch.create',
  dispatchUpdate: 'dispatch.update',
  dispatchDelete: 'dispatch.delete',
  gateView: 'gate.view',
  gateUpdate: 'gate.update',
  gateApprove: 'gate.approve',
  yardView: 'yard.view',
  yardUpdate: 'yard.update',
  yardApprove: 'yard.approve',
  feeView: 'fee.view',
  feeCreate: 'fee.create',
  feeUpdate: 'fee.update',
  feeApprove: 'fee.approve',
  feeExport: 'fee.export',
  catalogView: 'catalog.view',
  catalogCreate: 'catalog.create',
  catalogUpdate: 'catalog.update',
  reportView: 'report.view',
  reportExport: 'report.export',
  systemView: 'system.view',
  systemCreate: 'system.create',
  systemUpdate: 'system.update',
  systemDelete: 'system.delete',
} as const;

/** Yêu cầu quyền: một mã, hoặc mảng mã — thỏa mãn khi có BẤT KỲ mã nào. */
export type PermissionRequirement = string | readonly string[] | null | undefined;

/**
 * Kiểm "người dùng có BẤT KỲ mã quyền nào trong danh sách yêu cầu không" — **fail-closed**.
 *
 * Danh sách rỗng (`[]`, `''`, `null`, `undefined`) nghĩa là *không mã quyền nào thỏa mãn*
 * nên trả `false`. Nhờ vậy `*hasPermission="quyenTinhToan()"` lúc dữ liệu chưa nạp xong
 * sẽ ẩn nút thay vì hiện nhầm.
 *
 * Riêng route KHÔNG khai `data.permission` là trường hợp "không ràng buộc" — `authGuard`
 * tự xử lý trước khi gọi hàm này, xem `auth.guard.ts`.
 */
export function hasAnyPermission(granted: readonly string[], required: PermissionRequirement): boolean {
  if (required === null || required === undefined) return false;
  const codes = typeof required === 'string' ? [required] : required;
  return codes.some((code) => granted.includes(code));
}

/** Route mặc định sau đăng nhập = mục menu đầu tiên có đường dẫn (duyệt sâu theo thứ tự API trả). */
export function firstMenuRoute(menu: readonly MenuItem[]): string {
  for (const item of menu) {
    if (item.route) return item.route;
    const childRoute = firstMenuRoute(item.children || []);
    if (childRoute) return childRoute;
  }
  return '';
}

/**
 * Chuẩn hóa đường dẫn nghiệp vụ về route đại diện trong cây menu.
 * Ví dụ: màn thu phí theo hồ sơ (`/declarations/:id/fees`) thuộc phân hệ Thu phí (`/fees/tax`),
 * không thuộc phân hệ Hồ sơ.
 */
export function resolveMenuPath(path: string): string {
  // Màn hình thu phí theo hồ sơ (`/declarations/:id/fees`) thuộc phân hệ Thu phí (Thu phí tờ khai)
  if (/^\/declarations\/[^/]+\/fees(?:\/.*)?$/.test(path)) {
    return '/fees/tax';
  }
  // Màn hình xử lý liên ngành theo hồ sơ (`/workflow/dossiers/:id`) thuộc Hàng đợi liên ngành
  if (/^\/workflow\/dossiers(?:\/.*)?$/.test(path)) {
    return '/workflow/queue';
  }
  // Lịch sử điều phối thuộc mục Điều phối
  if (/^\/dispatch\/history(?:\/.*)?$/.test(path)) {
    return '/operations/vehicle-confirmation';
  }
  return path;
}

/**
 * Tìm đường dẫn nhãn (breadcrumb) của một url trong cây menu.
 *
 * Duyệt 2 lượt: ưu tiên mục khớp CHÍNH XÁC trên toàn bộ cây, không tìm thấy mới xét mục
 * khớp theo tiền tố. Nếu chỉ duyệt một lượt thì `/declarations/new` sẽ dính vào mục
 * "Danh sách hồ sơ" (`/declarations`) chỉ vì mục đó đứng trước mục "Tạo hồ sơ".
 */
export function menuTrail(menu: readonly MenuItem[], url: string): MenuItem[] {
  const rawPath = url.split('?')[0].split('#')[0];
  const path = resolveMenuPath(rawPath);
  const exact = exactMenuTrail(menu, path);
  return exact.length ? exact : prefixMenuTrail(menu, path);
}

/** Lượt 1: chỉ chấp nhận `route` trùng khít url. */
function exactMenuTrail(menu: readonly MenuItem[], path: string): MenuItem[] {
  for (const item of menu) {
    const childTrail = exactMenuTrail(item.children || [], path);
    if (childTrail.length) return [item, ...childTrail];
    if (item.route && item.route === path) return [item];
  }
  return [];
}

/** Lượt 2: url là route con không khai trong menu — chọn mục có `route` DÀI NHẤT (cụ thể nhất). */
function prefixMenuTrail(menu: readonly MenuItem[], path: string): MenuItem[] {
  let best: MenuItem[] = [];
  let bestLength = -1;

  for (const item of menu) {
    const childTrail = prefixMenuTrail(item.children || [], path);
    if (childTrail.length) {
      const childLength = childTrail[childTrail.length - 1].route.length;
      if (childLength > bestLength) {
        best = [item, ...childTrail];
        bestLength = childLength;
      }
    }
    if (item.route && path.startsWith(`${item.route}/`) && item.route.length > bestLength) {
      best = [item];
      bestLength = item.route.length;
    }
  }

  return best;
}
