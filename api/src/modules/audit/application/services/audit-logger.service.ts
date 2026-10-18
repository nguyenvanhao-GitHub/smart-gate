import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditEntryInput, AuditLogger, AuditResult } from '../../../../common/audit/audit-logger.port';
import { RequestContext } from '../../../../common/context/request-context';
import { AuditLog } from '../../domain/audit-log.entity';
import { AUDIT_LOG_REPOSITORY, AuditLogRepository } from '../ports/audit-log.repository';

/**
 * Hiện thực `AUDIT_LOGGER`. Actor/IP/correlationId lấy từ `RequestContext` nếu lời gọi không
 * truyền tường minh (ví dụ đăng nhập thất bại thì chưa có actor trong ngữ cảnh).
 *
 * Ghi nhật ký **không được làm hỏng nghiệp vụ**: mọi lỗi lưu log đều bị nuốt và chỉ ghi cảnh báo.
 */
@Injectable()
export class AuditLoggerService implements AuditLogger {
  private readonly logger = new Logger(AuditLoggerService.name);

  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly logs: AuditLogRepository,
  ) { }

  async record(entry: AuditEntryInput): Promise<void> {
    const context = RequestContext.current();
    try {
      // 1. Lấy giá trị raw của role
      let safeRole = entry.actorRole ?? context?.actorRole ?? null;

      // 2. Xử lý độ dài của role nếu có dữ liệu
      if (safeRole) {
        // Nếu chuỗi đang bị nối bởi nhiều quyền (ví dụ: ROLE_A+ROLE_B), ưu tiên lấy quyền đầu tiên
        if (safeRole.includes('+')) {
          safeRole = safeRole.split('+')[0];
        }

        // Đảm bảo an toàn tuyệt đối: nếu vẫn dài hơn 32 ký tự thì cắt bỏ phần đuôi
        if (safeRole.length > 32) {
          safeRole = safeRole.substring(0, 32);
        }
      }

      await this.logs.save(
        AuditLog.create({
          actorId: entry.actorId ?? context?.actorId ?? null,
          actorUsername: entry.actorUsername ?? context?.actorUsername ?? null,
          actorRole: safeRole, // Truyền biến đã được xử lý an toàn vào đây
          ip: context?.ip ?? null,
          correlationId: context?.correlationId ?? null,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId ?? null,
          result: entry.result ?? AuditResult.SUCCESS,
          before: entry.before ?? null,
          after: entry.after ?? null,
        }),
      );
    } catch (error) {
      this.logger.warn(`Không ghi được nhật ký kiểm toán cho hành động ${entry.action}: ${(error as Error).message}`);
    }
  }
}
