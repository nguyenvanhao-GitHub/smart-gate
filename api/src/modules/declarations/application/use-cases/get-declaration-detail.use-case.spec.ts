import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DeclarationStatus } from '../../domain/declaration.enums';
import { GetDeclarationDetailUseCase } from './get-declaration-detail.use-case';
import {
  FakeDossierAttachments,
  InMemoryDeclarationRepository,
  makeAccess,
  makeCompleteDraft,
} from '../../testing/declaration.fixture';
import { DossierScopeService } from '../services/dossier-scope.service';
import { WorkflowRouteService } from '../../../workflow/application/services/workflow-route.service';
import { WorkflowProvisioningService } from '../../../workflow/application/services/workflow-provisioning.service';
import {
  FakeSettingsReader,
  FakeStepDirectory,
  InMemoryWorkflowInstanceRepository,
} from '../../../workflow/testing/workflow.fixture';
import { AgencyAction } from '../../../workflow/domain/agency-action.entity';
import { WorkflowDecision } from '../../../workflow/domain/workflow.enums';

class FakeGatePassage {
  async timesOf() {
    return { entryAt: null, exitAt: null };
  }
}

class RecordingAudit {
  readonly logs: unknown[] = [];
  async record(entry: unknown): Promise<void> {
    this.logs.push(entry);
  }
}

describe('GetDeclarationDetailUseCase (SG-116: Hiển thị đầy đủ lịch sử xử lý hồ sơ)', () => {
  const access = makeAccess({ userId: 'user-admin' });

  it('trả về đầy đủ lịch sử xử lý gồm Yêu cầu bổ sung, Từ chối và Duyệt kèm ghi chú (SG-116)', async () => {
    const declaration = makeCompleteDraft({
      id: 'dossier-1',
      code: 'EXP-20260815-000001',
      status: DeclarationStatus.PROCESSING,
      createdById: 'user-admin',
    });
    declaration.submittedAt = new Date('2026-08-15T08:05:00Z');
    declaration.enterprise = {
      id: 'ent-1',
      taxCode: '0101234567',
      name: 'Công ty TNHH Xuất Nhập Khẩu ABC',
    };

    const declarations = new InMemoryDeclarationRepository([declaration]);
    const instances = new InMemoryWorkflowInstanceRepository();
    const scope = new DossierScopeService(new DataScopeService());
    const routes = new WorkflowRouteService(new FakeStepDirectory());
    const provisioning = new WorkflowProvisioningService(instances, new FakeSettingsReader());
    const audit = new RecordingAudit();

    // Thêm các quyết định xử lý thực tế
    await instances.appendAction(
      AgencyAction.create({
        dossierId: declaration.id,
        instanceId: 'inst-1',
        stepCode: 'EXPORT_QUARANTINE',
        agencyCode: 'KD',
        actorId: 'user-kd',
        actorName: 'Cán bộ Kiểm dịch',
        decision: WorkflowDecision.REQUEST_SUPPLEMENT,
        reasonCode: 'THIEU_GIAY_TO',
        reasonNote: 'Thiếu giấy chứng nhận kiểm dịch thực vật',
        elapsedSeconds: 120,
        actedAt: new Date('2026-08-15T08:30:00Z'),
      }),
    );

    await instances.appendAction(
      AgencyAction.create({
        dossierId: declaration.id,
        instanceId: 'inst-1',
        stepCode: 'EXPORT_CUSTOMS',
        agencyCode: 'HQ',
        actorId: 'user-hq',
        actorName: 'Cán bộ Hải quan',
        decision: WorkflowDecision.REJECT,
        reasonCode: 'SAI_HS_CODE',
        reasonNote: 'Sai mã định danh hàng hóa và tờ khai',
        elapsedSeconds: 200,
        actedAt: new Date('2026-08-15T09:00:00Z'),
      }),
    );

    await instances.appendAction(
      AgencyAction.create({
        dossierId: declaration.id,
        instanceId: 'inst-1',
        stepCode: 'EXPORT_BARRIE_2',
        agencyCode: 'BP',
        actorId: 'user-bp',
        actorName: 'Biên phòng Cửa khẩu',
        decision: WorkflowDecision.APPROVE,
        reasonCode: null,
        reasonNote: 'Cho phép phương tiện vào barrie',
        elapsedSeconds: 60,
        actedAt: new Date('2026-08-15T09:30:00Z'),
      }),
    );

    const useCase = new GetDeclarationDetailUseCase(
      declarations,
      new FakeDossierAttachments(),
      new FakeGatePassage(),
      scope,
      routes,
      provisioning,
      instances,
      audit,
    );

    const detail = await useCase.execute(declaration.id, access);

    expect(detail.workflowHistory).toBeDefined();
    expect(detail.workflowHistory.length).toBe(4); // 1 submit + 3 actions

    // Bản ghi mới nhất trước
    expect(detail.workflowHistory[0].decision).toBe('APPROVE');
    expect(detail.workflowHistory[0].actorName).toBe('Biên phòng Cửa khẩu');

    expect(detail.workflowHistory[1].decision).toBe('REJECT');
    expect(detail.workflowHistory[1].actorName).toBe('Cán bộ Hải quan');
    expect(detail.workflowHistory[1].note).toBe('Sai mã định danh hàng hóa và tờ khai');

    expect(detail.workflowHistory[2].decision).toBe('REQUEST_SUPPLEMENT');
    expect(detail.workflowHistory[2].actorName).toBe('Cán bộ Kiểm dịch');
    expect(detail.workflowHistory[2].note).toBe('Thiếu giấy chứng nhận kiểm dịch thực vật');

    expect(detail.workflowHistory[3].decision).toBe('SUBMITTED');
    expect(detail.workflowHistory[3].process).toBe('Doanh nghiệp khai báo');
  });

  it('hiển thị đầy đủ lịch sử nhiều lần Yêu cầu bổ sung và Doanh nghiệp bổ sung hồ sơ (SG-116)', async () => {
    const declaration = makeCompleteDraft({
      id: 'dossier-history-full',
      code: 'IMP-20260818-000001',
      status: DeclarationStatus.BUSINESS_PROCESSING,
      createdById: 'user-admin',
    });
    declaration.enterprise = {
      id: 'ent-1',
      taxCode: '0101234567',
      name: 'Công ty TNHH Dịch vụ Giải pháp ABC',
    };
    declaration.auditTrail = [
      {
        id: 'aud-1',
        at: new Date('2026-08-18T14:00:00Z'),
        actorId: 'ent-1',
        actorRole: 'ENTERPRISE',
        action: 'SUBMIT' as any,
        note: 'Doanh nghiệp gửi hồ sơ.',
      },
      {
        id: 'aud-2',
        at: new Date('2026-08-18T15:30:00Z'),
        actorId: 'ent-1',
        actorRole: 'ENTERPRISE',
        action: 'RESUBMIT' as any,
        note: 'Doanh nghiệp bổ sung hồ sơ.',
      },
    ];

    const declarations = new InMemoryDeclarationRepository([declaration]);
    const instances = new InMemoryWorkflowInstanceRepository();
    const scope = new DossierScopeService(new DataScopeService());
    const routes = new WorkflowRouteService(new FakeStepDirectory());
    const provisioning = new WorkflowProvisioningService(instances, new FakeSettingsReader());
    const audit = new RecordingAudit();

    await instances.appendAction(
      AgencyAction.create({
        dossierId: declaration.id,
        instanceId: 'inst-1',
        stepCode: 'IMPORT_BORDER',
        agencyCode: 'BP',
        actorId: 'user-bp',
        actorName: 'Biên phòng cửa khẩu',
        decision: WorkflowDecision.REQUEST_SUPPLEMENT,
        reasonCode: 'THIEU_GIAY_TO',
        reasonNote: 'thiếu o/c',
        elapsedSeconds: 100,
        actedAt: new Date('2026-08-18T14:40:00Z'),
      }),
    );

    await instances.appendAction(
      AgencyAction.create({
        dossierId: declaration.id,
        instanceId: 'inst-1',
        stepCode: 'IMPORT_BORDER',
        agencyCode: 'BP',
        actorId: 'user-bp',
        actorName: 'Biên phòng cửa khẩu',
        decision: WorkflowDecision.APPROVE,
        reasonCode: null,
        reasonNote: null,
        elapsedSeconds: 120,
        actedAt: new Date('2026-08-18T15:37:00Z'),
      }),
    );

    const useCase = new GetDeclarationDetailUseCase(
      declarations,
      new FakeDossierAttachments(),
      new FakeGatePassage(),
      scope,
      routes,
      provisioning,
      instances,
      audit,
    );

    const detail = await useCase.execute(declaration.id, access);

    expect(detail.workflowHistory.length).toBe(4);
    expect(detail.workflowHistory[0].decision).toBe('APPROVE');

    expect(detail.workflowHistory[1].process).toBe('Doanh nghiệp bổ sung hồ sơ');
    expect(detail.workflowHistory[1].decision).toBe('SUBMITTED');

    expect(detail.workflowHistory[2].decision).toBe('REQUEST_SUPPLEMENT');
    expect(detail.workflowHistory[2].note).toBe('thiếu o/c');

    expect(detail.workflowHistory[3].process).toBe('Doanh nghiệp khai báo');
    expect(detail.workflowHistory[3].decision).toBe('SUBMITTED');
  });
});
