import { AuditLogsController } from './audit-logs.controller';
import { AuditResult } from '../../../../common/audit/audit-logger.port';

describe('AuditLogsController', () => {
  let controller: AuditLogsController;
  let listAuditLogsUseCase: any;
  let exportAuditLogsUseCase: any;
  let auditLogger: any;
  let recordedEntries: any[];

  beforeEach(() => {
    recordedEntries = [];
    listAuditLogsUseCase = { execute: jest.fn() };
    exportAuditLogsUseCase = { execute: jest.fn() };
    auditLogger = {
      record: jest.fn((entry) => {
        recordedEntries.push(entry);
        return Promise.resolve();
      }),
    };

    controller = new AuditLogsController(listAuditLogsUseCase, exportAuditLogsUseCase, auditLogger);
  });

  describe('logExportResult (SG-225)', () => {
    const mockActor = { sub: 'user-123', roles: ['SYS_ADMIN'] } as any;

    it('ghi nhận kết quả CANCELLED với note tương ứng', async () => {
      const res = await controller.logExportResult(
        {
          action: 'REPORT_EXPORT',
          targetType: 'AUDIT_LOG',
          targetId: 'export',
          result: AuditResult.CANCELLED,
          reportName: 'Nhật ký thao tác',
          filter: { action: 'LOGIN' },
        },
        mockActor,
      );

      expect(res).toEqual({ success: true });
      expect(recordedEntries).toHaveLength(1);
      expect(recordedEntries[0]).toMatchObject({
        action: 'REPORT_EXPORT',
        targetType: 'AUDIT_LOG',
        targetId: 'export',
        result: AuditResult.CANCELLED,
        actorId: 'user-123',
        after: {
          reportName: 'Nhật ký thao tác',
          note: 'Người dùng chủ động hủy/thoát thao tác lưu file.',
        },
      });
    });

    it('ghi nhận kết quả FAILURE với note tương ứng', async () => {
      await controller.logExportResult(
        {
          result: AuditResult.FAILURE,
          reportName: 'Báo cáo qua cổng',
        },
        mockActor,
      );

      expect(recordedEntries).toHaveLength(1);
      expect(recordedEntries[0].after.note).toBe('Hệ thống xảy ra lỗi và không thể hoàn tất việc xuất file.');
    });

    it('ghi nhận kết quả SUCCESS với note tương ứng', async () => {
      await controller.logExportResult(
        {
          result: AuditResult.SUCCESS,
          reportName: 'Đối soát phí',
        },
        mockActor,
      );

      expect(recordedEntries).toHaveLength(1);
      expect(recordedEntries[0].after.note).toBe('File được tạo và lưu thành công.');
    });
  });
});
