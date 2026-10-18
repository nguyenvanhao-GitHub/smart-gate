import { AuditEntryInput, AuditLogger, AuditResult } from '../../../../common/audit/audit-logger.port';
import { PaginatedResult } from '../../../../common/http/pagination';
import { AuditLog } from '../../domain/audit-log.entity';
import { AuditLogRepository, AuditLogSearchCriteria } from '../ports/audit-log.repository';
import { ExportAuditLogsUseCase } from './export-audit-logs.use-case';

/** Kho nhật ký giả lập — phân trang trong bộ nhớ và ghi lại tiêu chí truy vấn của lần gọi cuối. */
class FakeAuditLogRepository implements AuditLogRepository {
  lastCriteria?: AuditLogSearchCriteria;
  constructor(private readonly rows: AuditLog[]) {}
  async save(): Promise<void> {}
  async findMany(criteria: AuditLogSearchCriteria): Promise<PaginatedResult<AuditLog>> {
    this.lastCriteria = criteria;
    const page = criteria.page ?? 1;
    const pageSize = criteria.pageSize ?? 100;
    const start = (page - 1) * pageSize;
    return { items: this.rows.slice(start, start + pageSize), total: this.rows.length, page, pageSize };
  }
}

function makeLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return new AuditLog(
    overrides.id ?? 'log-1',
    overrides.at ?? new Date('2026-08-02T05:00:00.000Z'),
    overrides.actorId ?? 'user-1',
    overrides.actorUsername ?? 'nvcong',
    overrides.actorRole ?? 'CUSTOMS',
    overrides.ip ?? '10.0.0.1',
    overrides.correlationId ?? null,
    overrides.action ?? 'AUTH_LOGIN',
    overrides.targetType ?? 'USER',
    overrides.targetId ?? 'user-1',
    overrides.result ?? AuditResult.SUCCESS,
    overrides.before ?? null,
    overrides.after ?? null,
  );
}

describe('ExportAuditLogsUseCase (BUG-027)', () => {
  let auditRecords: AuditEntryInput[];
  let audit: AuditLogger;

  beforeEach(() => {
    auditRecords = [];
    audit = { record: async (entry) => void auditRecords.push(entry) };
  });

  it('dựng CSV có BOM, dòng tiêu đề và một dòng cho mỗi bản ghi', async () => {
    const repo = new FakeAuditLogRepository([makeLog(), makeLog({ id: 'log-2', action: 'REPORT_EXPORT' })]);
    const useCase = new ExportAuditLogsUseCase(repo, audit);

    const result = await useCase.execute({ actorId: 'admin-1', actorRole: 'SYS_ADMIN' });

    const text = result.content.toString('utf-8');
    expect(text.charCodeAt(0)).toBe(0xfeff); // BOM UTF-8
    const lines = text.slice(1).split('\r\n'); // bỏ ký tự BOM đầu tệp
    expect(lines[0]).toContain('Thời điểm');
    expect(lines).toHaveLength(3); // 1 tiêu đề + 2 bản ghi
    expect(result.rowCount).toBe(2);
    expect(result.fileName).toMatch(/^nhat-ky-he-thong-\d{8}-\d{4}\.csv$/);
  });

  it('chuyển đúng bộ lọc khoảng ngày xuống kho nhật ký', async () => {
    const repo = new FakeAuditLogRepository([makeLog()]);
    const useCase = new ExportAuditLogsUseCase(repo, audit);
    const from = new Date('2026-08-01T17:00:00.000Z');
    const to = new Date('2026-08-02T16:59:59.999Z');

    await useCase.execute({ from, to, actorId: 'admin-1', actorRole: 'SYS_ADMIN' });

    expect(repo.lastCriteria?.from).toBe(from);
    expect(repo.lastCriteria?.to).toBe(to);
  });
});
