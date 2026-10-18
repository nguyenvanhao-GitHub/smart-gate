/**
 * Cổng ghi nhật ký kiểm toán (F05). Đặt ở common để mọi module ghi log được mà không phụ thuộc
 * vào hiện thực của module `audit`.
 */
export const AUDIT_LOGGER = Symbol('AUDIT_LOGGER');

export enum AuditResult {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  CANCELLED = 'CANCELLED',
}

export interface AuditEntryInput {
  /** Mã hành động, ví dụ: AUTH_LOGIN, USER_CREATE, DECLARATION_CONFIRM. */
  action: string;
  /** Loại đối tượng bị tác động, ví dụ: USER, DECLARATION, ROLE. */
  targetType: string;
  targetId?: string;
  result?: AuditResult;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Bỏ trống thì lấy từ RequestContext. */
  actorId?: string;
  actorRole?: string;
  actorUsername?: string;
}

export interface AuditLogger {
  record(entry: AuditEntryInput): Promise<void>;
}
