import { randomUUID } from 'crypto';
import { AuditResult } from '../../../common/audit/audit-logger.port';

/** Một dòng nhật ký kiểm toán (F05): ai, lúc nào, từ đâu, làm gì, kết quả, giá trị trước/sau. */
export class AuditLog {
  constructor(
    public readonly id: string,
    public readonly at: Date,
    public readonly actorId: string | null,
    public readonly actorUsername: string | null,
    public readonly actorRole: string | null,
    public readonly ip: string | null,
    public readonly correlationId: string | null,
    public readonly action: string,
    public readonly targetType: string,
    public readonly targetId: string | null,
    public readonly result: AuditResult,
    public readonly before: Record<string, unknown> | null,
    public readonly after: Record<string, unknown> | null,
  ) {}

  static create(input: {
    actorId?: string | null;
    actorUsername?: string | null;
    actorRole?: string | null;
    ip?: string | null;
    correlationId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    result?: AuditResult;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  }): AuditLog {
    return new AuditLog(
      randomUUID(),
      new Date(),
      input.actorId ?? null,
      input.actorUsername ?? null,
      input.actorRole ?? null,
      input.ip ?? null,
      input.correlationId ?? null,
      input.action,
      input.targetType,
      input.targetId ?? null,
      input.result ?? AuditResult.SUCCESS,
      input.before ?? null,
      input.after ?? null,
    );
  }
}
