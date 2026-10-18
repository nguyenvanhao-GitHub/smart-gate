import { NotFoundException } from '@nestjs/common';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { AssignmentType } from '../../../access-control/domain/assignment-type.enum';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { makeAccess } from '../../../declarations/testing/declaration.fixture';
import { ReportCode } from '../../domain/report.catalog';
import { FakeReportQueryRepository } from '../../testing/report.fixture';
import { RunReportUseCase } from './run-report.use-case';

const ENTERPRISE_A = { taxCode: '5500111111', name: 'Doanh nghiệp A' };

const ADMIN = makeAccess({
  userId: 'user-admin',
  roles: [{ code: 'MANAGEMENT', name: 'Lãnh đạo', dataScope: DataScopeLevel.ALL }],
  permissions: ['report.view', 'report.export'],
});

const ENTERPRISE_A_USER = makeAccess({
  userId: 'user-dn-a',
  permissions: ['report.view'],
  assignments: [{ type: AssignmentType.TAX_CODE, value: ENTERPRISE_A.taxCode }],
});

describe('RunReportUseCase', () => {
  const scopeService = new DossierScopeService(new DataScopeService());

  function build(data = {}) {
    const reports = new FakeReportQueryRepository(data);
    return { reports, useCase: new RunReportUseCase(reports, scopeService) };
  }

  it('trả 404 tiếng Việt khi mã báo cáo không tồn tại', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ code: 'khong-co', filter: {}, access: ADMIN })).rejects.toThrow(NotFoundException);
    await expect(useCase.execute({ code: 'khong-co', filter: {}, access: ADMIN })).rejects.toThrow(
      /Không tìm thấy báo cáo/,
    );
  });

  it('truyền phạm vi dữ liệu OWN của người gọi xuống tận truy vấn báo cáo', async () => {
    const { reports, useCase } = build();

    await useCase.execute({ code: ReportCode.GATE_EVENT, filter: {}, access: ENTERPRISE_A_USER });

    const seen = reports.seenScopes.find((entry) => entry.method === 'findGateEvents');
    expect(seen?.scope).toMatchObject({ unrestricted: false, taxCodes: [ENTERPRISE_A.taxCode] });
  });

  describe('Lưu lượng hồ sơ theo ngày', () => {
    it('cộng dồn thành summary.dossiers — con số đối chiếu với drilldown', async () => {
      const { useCase } = build({
        throughput: [
          { date: '2026-07-20', total: 4, submitted: 3, completed: 1, rejected: 0 },
          { date: '2026-07-21', total: 6, submitted: 5, completed: 2, rejected: 1 },
        ],
      });

      const result = await useCase.execute({ code: ReportCode.DOSSIER_THROUGHPUT, filter: {}, access: ADMIN });

      expect(result.total).toBe(2);
      expect(result.summary).toEqual({ dossiers: 10, submitted: 8, completed: 3, rejected: 1 });
      expect(result.drilldown?.route).toBe('/declarations');
    });

    it('SG-176: cả hai trường Từ ngày và Đến ngày đều lọc theo Ngày tạo hồ sơ (createdAt)', async () => {
      const { reports, useCase } = build({
        throughput: [{ date: '2026-08-15', total: 5, submitted: 3, completed: 2, rejected: 0 }],
      });

      await useCase.execute({
        code: ReportCode.DOSSIER_THROUGHPUT,
        filter: { from: '2026-08-01', to: '2026-08-20' },
        access: ADMIN,
      });

      const seen = reports.seenScopes.find((entry) => entry.method === 'findDossierThroughput') as any;
      expect(seen.criteria.filter.from).toBe('2026-08-01');
      expect(seen.criteria.filter.to).toBe('2026-08-20');
    });
  });

  describe('Báo cáo liên ngành', () => {
    const actionStats = [
      { stepCode: 'IMPORT_CUSTOMS', decision: 'APPROVE', actions: 3, totalSeconds: 900, maxSeconds: 600 },
      { stepCode: 'EXPORT_CUSTOMS', decision: 'REJECT', actions: 1, totalSeconds: 300, maxSeconds: 300 },
      { stepCode: 'IMPORT_BORDER', decision: 'APPROVE', actions: 2, totalSeconds: 200, maxSeconds: 150 },
    ];

    it('thời gian trung bình tính trên tổng số giây, gộp xuất và nhập vào đúng 03 lực lượng', async () => {
      const { useCase } = build({ actionStats });

      const result = await useCase.execute({
        code: ReportCode.AGENCY_PROCESSING_TIME,
        filter: {},
        access: ADMIN,
      });

      // Trả về đúng 3 dòng cho 3 lực lượng: Biên phòng, Hải quan, Kiểm dịch
      expect(result.rows).toHaveLength(3);

      const customs = result.rows.find((row) => row.agencyCode === 'CUSTOMS');
      expect(customs).toMatchObject({
        agencyCode: 'CUSTOMS',
        agencyName: 'Hải quan',
        stepName: 'Hải quan kiểm tra nghiệp vụ theo chuyên ngành',
        actions: 4,
        averageSeconds: 300,
        maxSeconds: 600,
      });

      const border = result.rows.find((row) => row.agencyCode === 'BORDER_GUARD');
      expect(border).toMatchObject({
        agencyCode: 'BORDER_GUARD',
        agencyName: 'Biên phòng',
        stepName: 'Biên phòng kiểm tra nghiệp vụ theo chuyên ngành',
        actions: 2,
        averageSeconds: 100,
        maxSeconds: 150,
      });

      const quarantine = result.rows.find((row) => row.agencyCode === 'QUARANTINE');
      expect(quarantine).toMatchObject({
        agencyCode: 'QUARANTINE',
        agencyName: 'Kiểm dịch',
        stepName: 'Kiểm dịch kiểm tra nghiệp vụ theo chuyên ngành',
        actions: 0,
        averageSeconds: 0,
        maxSeconds: 0,
      });

      expect(result.summary).toEqual({ actions: 6, averageSeconds: Math.round(1400 / 6) });
    });

    it('lọc theo lực lượng suy từ mã bước, không tin cột agency_code', async () => {
      const { useCase } = build({ actionStats });

      const result = await useCase.execute({
        code: ReportCode.AGENCY_PROCESSING_TIME,
        filter: { agencyCode: 'BORDER_GUARD' },
        access: ADMIN,
      });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ agencyCode: 'BORDER_GUARD', actions: 2 });
    });

    it('bảng quyết định tách đúng từng loại quyết định', async () => {
      const { useCase } = build({ actionStats });

      const result = await useCase.execute({ code: ReportCode.AGENCY_DECISION, filter: {}, access: ADMIN });
      const customs = result.rows.find((row) => row.agencyCode === 'CUSTOMS');

      expect(customs).toMatchObject({ approve: 3, reject: 1, requestSupplement: 0, total: 4 });
      expect(result.summary).toEqual({ actions: 6 });
    });
  });

  describe('Nhật ký cổng và tồn bãi', () => {
    it('mỗi dòng nhật ký cổng mang theo mã hồ sơ để mở chi tiết', async () => {
      const { useCase } = build({
        gateEvents: [
          {
            occurredAt: new Date('2026-07-22T09:00:00.000Z'),
            dossierId: '01',
            dossierCode: 'CK-01',
            plateNumber: '26C-123.45',
            gateCode: 'B1',
            direction: 'EXIT',
            decision: 'ALLOW',
            statusColor: 'GREEN',
            actorName: 'Nguyễn Văn A',
            note: null,
          },
        ],
      });

      const result = await useCase.execute({ code: ReportCode.GATE_EVENT, filter: {}, access: ADMIN });

      expect(result.total).toBe(1);
      expect(result.rows[0]).toMatchObject({ dossierId: '01', dossierCode: 'CK-01', decision: 'Cho qua', direction: 'Ra' });
      expect(result.drilldown).toEqual({ route: '/operations/vehicles-entered-gate', queryParams: {} });
    });

    it('SG-223: tổng hợp 4 nhóm hành động vào summary và KPI events luôn bằng tổng 4 nhóm', async () => {
      const { useCase } = build({
        gateEvents: [
          { occurredAt: new Date(), dossierId: '1', dossierCode: 'HS-1', plateNumber: '29A-1', gateCode: 'G1', direction: 'ENTRY', decision: 'ALLOW', statusColor: 'GREEN', actorName: 'A', note: null },
          { occurredAt: new Date(), dossierId: '2', dossierCode: 'HS-2', plateNumber: '29A-2', gateCode: 'G1', direction: 'ENTRY', decision: 'ALLOW', statusColor: 'GREEN', actorName: 'A', note: null },
          { occurredAt: new Date(), dossierId: '3', dossierCode: 'HS-3', plateNumber: '29A-3', gateCode: 'G1', direction: 'ENTRY', decision: 'DENY', statusColor: 'RED', actorName: 'A', note: null },
          { occurredAt: new Date(), dossierId: '4', dossierCode: 'HS-4', plateNumber: '29A-4', gateCode: 'G1', direction: 'EXIT', decision: 'ALLOW', statusColor: 'GREEN', actorName: 'A', note: null },
          { occurredAt: new Date(), dossierId: '5', dossierCode: 'HS-5', plateNumber: '29A-5', gateCode: 'G1', direction: 'EXIT', decision: 'DENY', statusColor: 'RED', actorName: 'A', note: null },
        ],
      });

      const result = await useCase.execute({
        code: ReportCode.GATE_EVENT,
        filter: { from: '2026-08-01', to: '2026-08-20' },
        access: ADMIN,
      });

      expect(result.summary).toEqual({
        events: 5,
        entryAllow: 2,
        entryDeny: 1,
        exitAllow: 1,
        exitDeny: 1,
      });
      // Đảm bảo events = entryAllow + entryDeny + exitAllow + exitDeny
      const sum =
        (result.summary?.['entryAllow'] ?? 0) +
        (result.summary?.['entryDeny'] ?? 0) +
        (result.summary?.['exitAllow'] ?? 0) +
        (result.summary?.['exitDeny'] ?? 0);
      expect(result.summary?.['events']).toBe(sum);
      expect(result.drilldown).toEqual({
        route: '/operations/vehicles-entered-gate',
        queryParams: { from: '2026-08-01', to: '2026-08-20' },
      });
    });

    it('tồn bãi tính số ô còn trống và không âm kèm drilldown sơ đồ bãi', async () => {
      const { useCase } = build({
        yardOccupancy: [
          { yardCode: 'A', yardName: 'Khu A', capacity: 16, slots: 16, occupied: 10 },
          { yardCode: 'B', yardName: 'Khu B', capacity: 16, slots: 8, occupied: 12 },
        ],
      });

      const result = await useCase.execute({ code: ReportCode.YARD_OCCUPANCY, filter: {}, access: ADMIN });

      expect(result.rows[0]).toMatchObject({ yardCode: 'A', available: 6 });
      expect(result.rows[1]).toMatchObject({ yardCode: 'B', available: 0 });
      expect(result.summary).toEqual({ slots: 24, occupied: 22, available: 6 });
      expect(result.drilldown).toEqual({ route: '/operations/customs-b5', queryParams: {} });
    });
  });
});
