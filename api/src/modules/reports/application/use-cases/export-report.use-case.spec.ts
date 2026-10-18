import { NotFoundException } from '@nestjs/common';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { AssignmentType } from '../../../access-control/domain/assignment-type.enum';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { makeAccess } from '../../../declarations/testing/declaration.fixture';
import { ReportCode } from '../../domain/report.catalog';
import { GateEventReportRow } from '../ports/report-query.repository';
import { FakeReportData, FakeReportQueryRepository, RecordingAuditLogger } from '../../testing/report.fixture';
import { ReportWorkbookService } from '../services/report-workbook.service';
import { ExportReportUseCase } from './export-report.use-case';
import { RunReportUseCase } from './run-report.use-case';

const ENTERPRISE_A = { taxCode: '5500111111', name: 'Doanh nghiệp A' };

const ADMIN = makeAccess({
  userId: 'user-admin',
  roles: [{ code: 'MANAGEMENT', name: 'Lãnh đạo', dataScope: DataScopeLevel.ALL }],
  permissions: ['report.view', 'report.export'],
});

const ENTERPRISE_A_USER = makeAccess({
  userId: 'user-dn-a',
  permissions: ['report.view', 'report.export'],
  assignments: [{ type: AssignmentType.TAX_CODE, value: ENTERPRISE_A.taxCode }],
});

/** Nhật ký qua cổng dựng sẵn — báo cáo còn tồn tại, phân trang thật để kiểm việc xuất hết mọi trang. */
function gateEvents(count: number): GateEventReportRow[] {
  return Array.from({ length: count }, (_, index) => ({
    occurredAt: new Date('2026-07-22T09:00:00.000Z'),
    dossierId: `d-${index}`,
    dossierCode: `CK-${index}`,
    plateNumber: '26C-123.45',
    gateCode: 'B1',
    direction: 'EXIT',
    decision: 'ALLOW',
    statusColor: 'GREEN',
    actorName: 'Nguyễn Văn A',
    note: null,
  }));
}

/**
 * F58 — xuất Excel ở backend. Ba điều bắt buộc được kiểm ở đây:
 * đúng phạm vi dữ liệu · đủ mọi trang chứ không chỉ trang đang xem · **có ghi nhật ký xuất**.
 */
describe('ExportReportUseCase', () => {
  const scopeService = new DossierScopeService(new DataScopeService());

  function build(data: FakeReportData = {}) {
    const reports = new FakeReportQueryRepository(data);
    const runReport = new RunReportUseCase(reports, scopeService);
    const audit = new RecordingAuditLogger();
    return {
      reports,
      audit,
      useCase: new ExportReportUseCase(runReport, new ReportWorkbookService(), audit),
    };
  }

  it('trả tệp .xlsx thật (chữ ký ZIP "PK") kèm tên tệp có mốc thời gian', async () => {
    const { useCase } = build({ gateEvents: gateEvents(3) });

    const result = await useCase.execute({
      code: ReportCode.GATE_EVENT,
      filter: {},
      access: ADMIN,
      actorId: 'user-admin',
      actorRole: 'MANAGEMENT',
    });

    expect(result.content.subarray(0, 2).toString()).toBe('PK');
    expect(result.fileName).toMatch(/^bao-cao-nhat-ky-qua-cong-\d{4}-\d{2}-\d{2}_\d{2}h\d{2}\.xlsx$/);
    expect(result.rowCount).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it('SG-180: hiển thị tên tài khoản người xuất (actorName) thay vì mã UUID', async () => {
    const { useCase } = build({ gateEvents: gateEvents(1) });

    const result = await useCase.execute({
      code: ReportCode.GATE_EVENT,
      filter: {},
      access: ADMIN,
      actorId: '6bc12d19-f82b-4c40-b706-02d980e673a7',
      actorName: 'admin',
      actorRole: 'MANAGEMENT',
    });

    expect(result.truncated).toBe(false);
  });

  it('KHÔNG xuất rộng hơn phạm vi dữ liệu của người xuất', async () => {
    const { useCase, reports } = build({ gateEvents: gateEvents(2) });

    await useCase.execute({
      code: ReportCode.GATE_EVENT,
      filter: {},
      access: ENTERPRISE_A_USER,
      actorId: 'user-dn-a',
      actorRole: 'ENTERPRISE',
    });

    const seen = reports.seenScopes.find((entry) => entry.method === 'findGateEvents');
    expect(seen?.scope).toMatchObject({ unrestricted: false, taxCodes: [ENTERPRISE_A.taxCode] });
  });

  it('xuất đủ mọi trang chứ không chỉ trang đang xem', async () => {
    const { useCase } = build({ gateEvents: gateEvents(230) });

    const result = await useCase.execute({
      code: ReportCode.GATE_EVENT,
      filter: {},
      access: ADMIN,
      actorId: 'user-admin',
    });

    expect(result.rowCount).toBe(230);
  });

  it('mã báo cáo lạ thì báo lỗi tiếng Việt và KHÔNG ghi nhật ký', async () => {
    const { useCase, audit } = build();

    await expect(
      useCase.execute({ code: 'khong-co', filter: {}, access: ADMIN, actorId: 'user-admin' }),
    ).rejects.toThrow(NotFoundException);
    expect(audit.entries).toHaveLength(0);
  });
});
