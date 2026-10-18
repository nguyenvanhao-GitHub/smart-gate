// Mô hình cho khu quản trị nền tảng: Danh mục dùng chung (F04) và Nhật ký thao tác (F05).
// Khớp đúng contract BE: catalogs.controller + audit-logs.controller.

import { MessageKey } from '../i18n/message-catalog';

// --- F04 Danh mục dùng chung ------------------------------------------------

export interface CatalogType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  /** Danh mục hệ thống: không cho đổi mã, chỉ sửa nội dung bên trong. */
  isSystem: boolean;
  sortOrder: number;
  /** Số mục bên trong nhóm — dùng cho badge đếm ở panel trái. */
  itemCount: number;
}

/** Tải trọng thêm/sửa nhóm danh mục. Khi sửa, mã nhóm cố định nên không gửi `code`. */
export interface CatalogTypePayload {
  code?: string;
  name: string;
  description?: string | null;
}

export type CatalogItemStatus = 'ACTIVE' | 'LOCKED';

export interface CatalogItem {
  id: string;
  typeCode: string;
  code: string;
  name: string;
  sortOrder: number;
  status: CatalogItemStatus;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface DossierFieldConfig {
  id?: string;
  dossierTypeCode?: string;
  sectionKey?: string;
  fieldKey: string;
  fieldName: string;
  isVisible: boolean;
  isRequired: boolean;
  isDefault: boolean;
  isLocked?: boolean;
  sortOrder?: number;
}

export const CATALOG_STATUS_LABEL_KEYS: Record<CatalogItemStatus, MessageKey> = {
  ACTIVE: 'ui.catalog.statusActive',
  LOCKED: 'ui.catalog.statusLocked',
};

export const CATALOG_STATUS_TONES: Record<CatalogItemStatus, string> = {
  ACTIVE: 'done',
  LOCKED: 'rejected',
};

export interface CatalogItemPayload {
  code: string;
  name: string;
  sortOrder?: number;
}

// --- F05 Nhật ký thao tác ---------------------------------------------------

export type AuditResult = 'SUCCESS' | 'FAILURE' | 'CANCELLED';

export interface AuditLogRow {
  id: string;
  at: string;
  actorId: string | null;
  actorUsername: string | null;
  /** Danh sách vai trò RBAC nối bằng `+` cho thao tác mới; mã vai trò cũ cho dòng lịch sử. */
  actorRole: string | null;
  ip: string | null;
  correlationId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  result: AuditResult;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface AuditLogFilters {
  actor?: string;
  action?: string;
  /** Danh sách các mã hành động khớp với từ khóa tìm kiếm (partial search / ILIKE). */
  actions?: string[];
  /** Phân hệ (F05) — lọc ở tầng máy chủ để thẻ thống kê và phân trang khớp tập đã lọc (BUG-051). */
  module?: AuditModuleCode;
  target?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Mã hành động nhật ký (ASCII, tập đóng) dùng cho ô lọc dạng dropdown — khớp đúng bộ mã có nhãn i18n
 * (`ui.audit.<code>`) và cũng là các mã BE thật ghi vào cột `action` (mọi lời gọi `audit.record`). BE
 * khớp `action` **chính xác** nên chọn từ tập này đảm bảo lọc trúng; mã lạ (nếu có) người dùng vẫn tra
 * được qua ô "Đối tượng"/thời gian. Xếp theo phân hệ để dropdown dễ đọc.
 */
export const AUDIT_ACTION_CODES = [
  // Hồ sơ khai báo & tệp đính kèm
  'DECLARATION_CREATE',
  'DECLARATION_COPY',
  'DECLARATION_UPDATE',
  'DECLARATION_SUBMIT',
  'DECLARATION_SUBMIT_REJECTED',
  'DECLARATION_CANCEL',
  'DECLARATION_DELETE',
  'DECLARATION_ATTACH_DOCUMENTS',
  'DECLARATION_DETACH_DOCUMENT',
  'VIEW_DOSSIER_DETAIL',
  'TIME_SLOT_UPDATE',
  'ATTACHMENT_UPLOAD',
  'ATTACHMENT_DOWNLOAD',
  'ATTACHMENT_DELETE',
  // Xử lý liên ngành
  'WORKFLOW_DECIDE',
  'WORKFLOW_SET_PRIORITY',
  // Điều phối & bãi
  'DISPATCH_ASSIGN',
  'DISPATCH_MOVE',
  'DISPATCH_RELEASE',
  'DISPATCH_CALL_NEXT',
  'DISPATCH_INSPECTION_CHANGED',
  'YARD_ZONE_UPDATE',
  // Cổng vào/ra
  'GATE_EVENT_ALLOW',
  'GATE_EVENT_DENY',
  // Thu phí
  'FEE_CALCULATE',
  'FEE_ADJUST',
  'FEE_RULE_CREATE',
  'FEE_RULE_UPDATE',
  'FEE_TRANSACTION_RECORD',
  'FEE_TRANSACTION_CONFIRM',
  'FEE_TRANSACTION_COLLECT',
  'FEE_WORKBENCH_ACTION',
  // Báo cáo
  'REPORT_EXPORT',
  // Tài khoản & phiên
  'AUTH_LOGIN',
  'AUTH_LOGOUT',
  'AUTH_REFRESH',
  'USER_REGISTER',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_APPROVE',
  'USER_DELETE',
  'USER_LOCK',
  'USER_UNLOCK',
  'USER_RESET_PASSWORD',
  'USER_ROLES_REPLACE',
  'USER_ASSIGNMENTS_REPLACE',
  'PROFILE_UPDATE',
  'PROFILE_CHANGE_PASSWORD',
  // Vai trò & quyền
  'ROLE_CREATE',
  'ROLE_UPDATE',
  'ROLE_DELETE',
  'ROLE_LOCK',
  'ROLE_UNLOCK',
  'ROLE_PERMISSIONS_REPLACE',
  // Danh mục dùng chung
  'CATALOG_TYPE_CREATE',
  'CATALOG_TYPE_UPDATE',
  'CATALOG_TYPE_DELETE',
  'CATALOG_ITEM_CREATE',
  'CATALOG_ITEM_UPDATE',
  'CATALOG_ITEM_DELETE',
  'CATALOG_ITEM_LOCK',
  'CATALOG_ITEM_UNLOCK',
  // Cấu hình hệ thống (BA-092)
  'SYSTEM_SETTINGS_UPDATE',
] as const;

export const AUDIT_RESULT_LABEL_KEYS: Record<AuditResult, MessageKey> = {
  SUCCESS: 'ui.audit.resultSuccess',
  FAILURE: 'ui.audit.resultFailure',
  CANCELLED: 'ui.audit.resultFailure',
};

/**
 * Phân hệ của một dòng nhật ký — **suy từ mã** `targetType`/tiền tố `action` (tập ĐÓNG mã ASCII, nhãn
 * tra qua i18n). BE không có cột phân hệ; việc **lọc** phân hệ nay chạy ở tầng máy chủ (BUG-051) để thẻ
 * thống kê và phân trang khớp tập đã lọc. Bản sao logic ở đây chỉ để **hiển thị nhãn phân hệ** của từng
 * dòng trên bảng/chi tiết; giữ đồng bộ với `audit-module.ts` phía api. Không so chuỗi tiếng Việt.
 */
export const AUDIT_MODULE_CODES = ['DOSSIER', 'CATALOG', 'FEE', 'REPORT', 'SYSTEM', 'OTHER'] as const;

export type AuditModuleCode = (typeof AUDIT_MODULE_CODES)[number];

export const AUDIT_MODULE_LABEL_KEYS: Record<AuditModuleCode, MessageKey> = {
  DOSSIER: 'ui.audit.moduleDossier',
  CATALOG: 'ui.audit.moduleCatalog',
  FEE: 'ui.audit.moduleFee',
  REPORT: 'ui.audit.moduleReport',
  SYSTEM: 'ui.audit.moduleSystem',
  OTHER: 'ui.audit.moduleOther',
};

/** Quy về phân hệ từ mã ASCII của dòng nhật ký — không dùng chuỗi hiển thị làm logic. */
export function auditModuleOf(row: Pick<AuditLogRow, 'action' | 'targetType'>): AuditModuleCode {
  if (row.action.startsWith('FEE_')) return 'FEE';
  if (row.action.startsWith('AUTH_')) return 'SYSTEM';
  switch (row.targetType) {
    case 'CATALOG_ITEM':
    case 'CATALOG_TYPE':
      return 'CATALOG';
    case 'REPORT':
      return 'REPORT';
    case 'FEE_RULE':
      return 'FEE';
    case 'USER':
    case 'ROLE':
    case 'SYSTEM_SETTING':
    case 'AUDIT_LOG':
      return 'SYSTEM';
    case 'DECLARATION':
    case 'DISPATCH_ASSIGNMENT':
    case 'ATTACHMENT':
      return 'DOSSIER';
    default:
      return 'OTHER';
  }
}

export const AUDIT_RESULT_TONES: Record<AuditResult, string> = {
  SUCCESS: 'done',
  FAILURE: 'rejected',
  CANCELLED: 'rejected',
};

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Một tham số cấu hình hệ thống (BA-092). `key`/`group`/`valueType` là **mã ASCII**; nhãn hiển thị
 * do web tra qua i18n theo `key`/`group`. `updatedAt = null` nghĩa là đang dùng giá trị mặc định.
 */
export interface SystemSetting {
  key: string;
  value: string;
  valueType: string;
  group: string;
  min: number;
  max: number;
  defaultValue: string;
  updatedAt: string | null;
  updatedById: string | null;
}

/** Một cặp khóa–giá trị gửi lên khi lưu cấu hình (giá trị luôn là chuỗi). */
export interface SystemSettingUpdate {
  key: string;
  value: string;
}
