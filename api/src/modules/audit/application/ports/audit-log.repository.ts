import { PaginatedResult } from '../../../../common/http/pagination';
import { AuditModuleCode } from '../../domain/audit-module';
import { AuditLog } from '../../domain/audit-log.entity';

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');

export interface AuditLogSearchCriteria {
  /** Khớp theo mã tài khoản hoặc tên đăng nhập của người thực hiện. */
  actor?: string;
  action?: string;
  /**
   * Lọc theo phân hệ (F05) — suy từ tiền tố `action`/`targetType` ngay ở tầng máy chủ để thẻ thống kê
   * và phân trang khớp đúng tập đã lọc (BUG-051), không lọc trên một trang ở web nữa.
   */
  module?: AuditModuleCode;
  /** Lọc theo tập mã hành động (khớp chính xác một trong danh sách) — dùng cho lịch sử điều phối (F33). */
  actions?: string[];
  /** Khớp theo loại đối tượng hoặc mã đối tượng bị tác động. */
  target?: string;
  /** Khớp **chính xác** mã đối tượng bị tác động (ví dụ tra lịch sử theo đúng một hồ sơ). */
  targetId?: string;
  /** Lọc theo danh sách mã đối tượng bị tác động. */
  targetIds?: string[];
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export interface AuditLogRepository {
  save(entry: AuditLog): Promise<void>;
  findMany(criteria: AuditLogSearchCriteria): Promise<PaginatedResult<AuditLog>>;
}
