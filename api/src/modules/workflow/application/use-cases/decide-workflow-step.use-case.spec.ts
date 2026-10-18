import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';

import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { Declaration } from '../../../declarations/domain/declaration.entity';
import {
  CheckpointCode,
  DeclarationStatus,
  DeclarationType,
  ForceStatus,
  WorkflowStepCode,
} from '../../../declarations/domain/declaration.enums';
import { InMemoryDeclarationRepository, makeDeclaration } from '../../../declarations/testing/declaration.fixture';
import { FakeDossierFeeCalculator, FakeFeeSettlement } from '../../../fees/testing/fee.fixture';
import { dossierStatusFor } from '../../domain/workflow-status.rules';
import { WorkflowInstance } from '../../domain/workflow-instance.entity';
import { WorkflowDecision, WorkflowInstanceStatus, WorkflowStepStatus } from '../../domain/workflow.enums';
import {
  FakeActorDirectory,
  FakeAuditLogger,
  FakeChecklistCatalog,
  FakeNotificationPublisher,
  FakeReasonCodeCatalog,
  FakeSettingsReader,
  FakeStepDirectory,
  InMemoryChecklistRepository,
  InMemoryWorkflowInstanceRepository,
  makeAgencyAccess,
} from '../../testing/workflow.fixture';
import { WorkflowProvisioningService } from '../services/workflow-provisioning.service';
import { WorkflowRouteService } from '../services/workflow-route.service';
import { DecideWorkflowStepUseCase } from './decide-workflow-step.use-case';

/**
 * DoD mốc M2: một hồ sơ nhập và một hồ sơ xuất chạy hết quy trình đúng thứ tự, còn thao tác sai
 * thứ tự **bị chặn ở API** chứ không phải chỉ ẩn nút trên giao diện.
 *
 * Từ CR7 (Batch D): **4 bước cổng** "Biên phòng xác nhận xe vào/ra tại Barrie" (bước ĐẦU và bước
 * CUỐI của mỗi luồng) do **sự kiện cổng** khép, KHÔNG quyết định được qua `decide` (→ 409). Vì vậy
 * `decide` chỉ chạy 4 bước liên ngành ở giữa; bước cổng vào được mô phỏng bằng `completeGateStep`
 * trước khi test (như thể xe đã qua cổng vào ở màn Cổng vào/ra).
 *
 * CR36: còn 3 quyết định — APPROVE ("Xác nhận hoàn thành"), REQUEST_SUPPLEMENT, REJECT.
 */
describe('DecideWorkflowStepUseCase', () => {
  const SUBMITTED_AT = new Date('2026-07-22T08:00:00.000Z');

  /** Bước cổng RA của mỗi luồng — do sự kiện cổng khép, không quyết định qua decide. */
  const IMPORT_EXIT_GATE = WorkflowStepCode.IMPORT_B2_EXIT;
  const EXPORT_EXIT_GATE = WorkflowStepCode.EXPORT_B1_EXIT;

  /** Bước → vai trò được phép, đúng theo dữ liệu seed của bảng `workflow_step_roles`. Chỉ các bước
   *  liên ngành ở giữa (không tính bước khai báo, không tính 2 bước cổng). */
  const EXPORT_BUSINESS_FLOW: Array<[WorkflowStepCode, string]> = [
    [WorkflowStepCode.EXPORT_CUSTOMS, 'CUSTOMS'],
    [WorkflowStepCode.EXPORT_QUARANTINE, 'QUARANTINE'],
    [WorkflowStepCode.EXPORT_BORDER, 'BORDER_GUARD'],
    [WorkflowStepCode.EXPORT_FEE, 'FEE_COLLECTOR'],
  ];

  const IMPORT_BUSINESS_FLOW: Array<[WorkflowStepCode, string]> = [
    [WorkflowStepCode.IMPORT_BORDER, 'BORDER_GUARD'],
    [WorkflowStepCode.IMPORT_QUARANTINE, 'QUARANTINE'],
    [WorkflowStepCode.IMPORT_CUSTOMS, 'CUSTOMS'],
    [WorkflowStepCode.IMPORT_FEE, 'FEE_COLLECTOR'],
  ];

  let declarations: InMemoryDeclarationRepository;
  let instances: InMemoryWorkflowInstanceRepository;
  let checklists: InMemoryChecklistRepository;
  let audit: FakeAuditLogger;
  let notifications: FakeNotificationPublisher;
  /** Nghĩa vụ tài chính giả lập — mặc định **đã thu đủ** (không nợ) để không chặn luồng chuẩn. */
  let settlements: FakeFeeSettlement;
  /** Cổng tự tính phí giả lập — ghi lại `dossierId` được gọi khi hồ sơ tới bước thu phí. */
  let feeCalculator: FakeDossierFeeCalculator;
  let routes: WorkflowRouteService;
  let useCase: DecideWorkflowStepUseCase;

  const makeSubmitted = (type: DeclarationType): Declaration =>
    makeDeclaration({
      id: type === DeclarationType.EXPORT ? 'decl-xuat' : 'decl-nhap',
      type,
      status: DeclarationStatus.SUBMITTED,
      submittedAt: SUBMITTED_AT,
      checkpoint: CheckpointCode.SMART_GATE,
    });

  /**
   * Mô phỏng "xe đã qua cổng vào" (CR7): mở phiên rồi khép bước cổng VÀO bằng `completeGateStep` để
   * hồ sơ đứng ở bước liên ngành đầu tiên — nơi `decide` bắt đầu hoạt động.
   */
  const startPastEntryGate = async (type: DeclarationType): Promise<Declaration> => {
    const declaration = makeSubmitted(type);
    await declarations.save(declaration);
    const route = await routes.routeFor(type);
    const instance = WorkflowInstance.start(declaration.id, type, route, SUBMITTED_AT, null);
    instance.completeGateStep(route, false, 'user-gate', 'Cổng vào', SUBMITTED_AT);
    await instances.save(instance);
    declaration.applyWorkflowStatus(dossierStatusFor(instance, route));
    await declarations.save(declaration);
    return declaration;
  };

  /**
   * CR2 — như `startPastEntryGate` nhưng hồ sơ có **cờ dịch tễ** (đã tích "Ưu tiên kiểm dịch" ở cổng
   * vào): cụm nghiệp vụ mở ra chỉ có Kiểm dịch, Biên phòng/Hải quan chờ tới khi Kiểm dịch hoàn thành.
   */
  const startPastEntryGateWithEpidemic = async (type: DeclarationType): Promise<Declaration> => {
    const declaration = makeSubmitted(type);
    declaration.markQuarantinePriority('user-gate', SUBMITTED_AT);
    await declarations.save(declaration);
    const route = await routes.routeFor(type);
    const instance = WorkflowInstance.start(declaration.id, type, route, SUBMITTED_AT, null);
    instance.completeGateStep(route, true, 'user-gate', 'Cổng vào', SUBMITTED_AT);
    await instances.save(instance);
    declaration.applyWorkflowStatus(dossierStatusFor(instance, route));
    await declarations.save(declaration);
    return declaration;
  };

  const decide = (
    declaration: Declaration,
    stepCode: WorkflowStepCode,
    roleCode: string,
    overrides: {
      decision?: WorkflowDecision;
      reasonCode?: string;
      reasonNote?: string;
      permissions?: string[];
      actorId?: string;
    } = {},
  ) =>
    useCase.execute({
      dossierId: declaration.id,
      stepCode,
      decision: overrides.decision ?? WorkflowDecision.APPROVE,
      reasonCode: overrides.reasonCode,
      reasonNote: overrides.reasonNote,
      actorId: overrides.actorId ?? `user-${roleCode.toLowerCase()}`,
      actorRole: 'DISPATCHER',
      access: makeAgencyAccess(roleCode, overrides.permissions),
    });

  beforeEach(() => {
    declarations = new InMemoryDeclarationRepository();
    instances = new InMemoryWorkflowInstanceRepository();
    checklists = new InMemoryChecklistRepository();
    audit = new FakeAuditLogger();
    notifications = new FakeNotificationPublisher();
    settlements = new FakeFeeSettlement();
    feeCalculator = new FakeDossierFeeCalculator();
    routes = new WorkflowRouteService(new FakeStepDirectory());

    useCase = new DecideWorkflowStepUseCase(
      declarations,
      instances,
      checklists,
      // Danh mục checklist khớp seed (mã ↔ lực lượng) để use-case lọc mục theo đúng lực lượng của bước.
      new FakeChecklistCatalog([
        { code: 'BP_GIAY_TO_NGUOI', label: 'Giấy tờ tùy thân', agencyCode: 'BORDER_GUARD', required: true },
        { code: 'BP_PHUONG_TIEN', label: 'Phương tiện', agencyCode: 'BORDER_GUARD', required: true },
        { code: 'HQ_TO_KHAI', label: 'Tờ khai hải quan', agencyCode: 'CUSTOMS', required: true },
        { code: 'KD_GIAY_CN', label: 'Giấy chứng nhận kiểm dịch', agencyCode: 'QUARANTINE', required: true },
      ]),
      new FakeReasonCodeCatalog(),
      new FakeActorDirectory('Nguyễn Văn Kiểm'),
      audit,
      notifications,
      settlements,
      feeCalculator,
      new DossierScopeService(new DataScopeService()),
      routes,
      new WorkflowProvisioningService(instances, new FakeSettingsReader()),
    );
  });

  // ---------------------------------------------------------------------------
  // 1. Hai luồng chạy hết quy trình đúng thứ tự (DoD mốc M2)
  // ---------------------------------------------------------------------------
  describe('Luồng XUẤT chạy hết 4 bước liên ngành, dừng ở đủ điều kiện ra cổng', () => {
    it('cụm nghiệp vụ song song rồi thu phí rồi đủ điều kiện ra cổng (CR44)', async () => {
      const declaration = await startPastEntryGate(DeclarationType.EXPORT);

      const expectedStatusAfterEachStep = [
        // Ba bước kiểm tra chạy song song → trạng thái đại diện "Đang xử lý nghiệp vụ" cho tới khi
        // cả cụm hoàn thành; bước thứ ba (bước nghiệp vụ cuối) xong mới mở giai đoạn thu phí.
        DeclarationStatus.BUSINESS_PROCESSING,
        DeclarationStatus.BUSINESS_PROCESSING,
        DeclarationStatus.WAITING_FOR_FEE,
        // Bước thu phí xong → đủ điều kiện ra cổng; CHƯA rời cửa khẩu (chờ sự kiện cổng).
        DeclarationStatus.READY_FOR_EXIT,
      ];

      for (const [index, [stepCode, roleCode]] of EXPORT_BUSINESS_FLOW.entries()) {
        const result = await decide(declaration, stepCode, roleCode);
        expect(result.instance.steps.find((step) => step.code === stepCode)?.status).toBe(WorkflowStepStatus.COMPLETED);
        expect(declaration.status).toBe(expectedStatusAfterEachStep[index]);
      }

      // Bước cổng ra KHÔNG quyết định được qua decide — cho qua cổng là sự kiện cổng (F38/F44).
      await expect(decide(declaration, EXPORT_EXIT_GATE, 'BORDER_GUARD')).rejects.toBeInstanceOf(ConflictException);
      expect(declaration.status).toBe(DeclarationStatus.READY_FOR_EXIT);

      const instance = await instances.findByDossierId(declaration.id);
      expect(instance?.status).toBe(WorkflowInstanceStatus.IN_PROGRESS);
      expect(instance?.currentStepCode).toBe(EXPORT_EXIT_GATE);
      expect(declaration.checkpoint).toBe(CheckpointCode.B1);
    });

    it('cột jsonb cũ workflowProgress vẫn được ghi song song (rủi ro R2 chưa gỡ)', async () => {
      const declaration = await startPastEntryGate(DeclarationType.EXPORT);

      for (const [stepCode, roleCode] of EXPORT_BUSINESS_FLOW) await decide(declaration, stepCode, roleCode);

      EXPORT_BUSINESS_FLOW.forEach(([stepCode]) => {
        expect(declaration.workflowProgress[stepCode]).toBe(ForceStatus.COMPLETED);
      });
    });
  });

  describe('Luồng NHẬP chạy hết 4 bước liên ngành, dừng ở đủ điều kiện ra cổng', () => {
    it('cụm nghiệp vụ song song rồi thu phí rồi đủ điều kiện ra cổng (CR44)', async () => {
      const declaration = await startPastEntryGate(DeclarationType.IMPORT);

      const expectedStatusAfterEachStep = [
        DeclarationStatus.BUSINESS_PROCESSING,
        DeclarationStatus.BUSINESS_PROCESSING,
        DeclarationStatus.WAITING_FOR_FEE,
        DeclarationStatus.READY_FOR_EXIT,
      ];

      for (const [index, [stepCode, roleCode]] of IMPORT_BUSINESS_FLOW.entries()) {
        await decide(declaration, stepCode, roleCode);
        expect(declaration.status).toBe(expectedStatusAfterEachStep[index]);
      }

      await expect(decide(declaration, IMPORT_EXIT_GATE, 'BORDER_GUARD')).rejects.toBeInstanceOf(ConflictException);

      const instance = await instances.findByDossierId(declaration.id);
      expect(instance?.status).toBe(WorkflowInstanceStatus.IN_PROGRESS);
      expect(instance?.currentStepCode).toBe(IMPORT_EXIT_GATE);
      expect(declaration.checkpoint).toBe(CheckpointCode.B2);
      // 4 bước liên ngành ghi 4 dòng nhật ký; bước cổng bị chặn nên không ghi thêm.
      expect(instances.actions).toHaveLength(IMPORT_BUSINESS_FLOW.length);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Gọi thẳng API sai thứ tự bước → bị từ chối (điều kiện nghiệm thu chính)
  // ---------------------------------------------------------------------------
  describe('Chặn thao tác sai thứ tự ở API', () => {
    it.each([
      [WorkflowStepCode.IMPORT_B1_ENTRY, 'BORDER_GUARD'],
      [WorkflowStepCode.IMPORT_QUARANTINE, 'QUARANTINE'],
      [WorkflowStepCode.IMPORT_CUSTOMS, 'CUSTOMS'],
      [WorkflowStepCode.IMPORT_FEE, 'FEE_COLLECTOR'],
      [WorkflowStepCode.IMPORT_B2_EXIT, 'BORDER_GUARD'],
    ])('luồng nhập: bắn thẳng bước %s khi hồ sơ mới gửi → 409', async (stepCode, roleCode) => {
      const declaration = makeSubmitted(DeclarationType.IMPORT);
      await declarations.save(declaration);

      await expect(decide(declaration, stepCode, roleCode)).rejects.toBeInstanceOf(ConflictException);
      // Hồ sơ không bị thay đổi gì sau thao tác bị chặn.
      expect(declaration.status).toBe(DeclarationStatus.SUBMITTED);
      expect(instances.actions).toHaveLength(0);
    });

    it.each([
      [WorkflowStepCode.EXPORT_B2_ENTRY, 'BORDER_GUARD'],
      [WorkflowStepCode.EXPORT_QUARANTINE, 'QUARANTINE'],
      [WorkflowStepCode.EXPORT_BORDER, 'BORDER_GUARD'],
      [WorkflowStepCode.EXPORT_FEE, 'FEE_COLLECTOR'],
      [WorkflowStepCode.EXPORT_B1_EXIT, 'BORDER_GUARD'],
    ])('luồng xuất: bắn thẳng bước %s khi hồ sơ mới gửi → 409', async (stepCode, roleCode) => {
      const declaration = makeSubmitted(DeclarationType.EXPORT);
      await declarations.save(declaration);
      await expect(decide(declaration, stepCode, roleCode)).rejects.toBeInstanceOf(ConflictException);
    });

    it('quyết định lại bước đã chốt → 409', async () => {
      const declaration = await startPastEntryGate(DeclarationType.IMPORT);
      await decide(declaration, WorkflowStepCode.IMPORT_BORDER, 'BORDER_GUARD');

      await expect(decide(declaration, WorkflowStepCode.IMPORT_BORDER, 'BORDER_GUARD')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('hồ sơ ở trạng thái WAITING_CALL chưa được Gọi xe vào kiểm tra → 409', async () => {
      const declaration = await startPastEntryGate(DeclarationType.EXPORT);
      declaration.applyWorkflowStatus(DeclarationStatus.WAITING_CALL);
      await declarations.save(declaration);

      await expect(decide(declaration, WorkflowStepCode.EXPORT_CUSTOMS, 'CUSTOMS')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('hồ sơ đã bị từ chối thì mọi bước sau đều bị chặn', async () => {
      const declaration = await startPastEntryGate(DeclarationType.IMPORT);
      await decide(declaration, WorkflowStepCode.IMPORT_BORDER, 'BORDER_GUARD', {
        decision: WorkflowDecision.REJECT,
        reasonCode: 'TC01',
        reasonNote: 'Sai lệch thông tin hàng hóa',
      });

      expect(declaration.status).toBe(DeclarationStatus.REJECTED);
      await expect(decide(declaration, WorkflowStepCode.IMPORT_QUARANTINE, 'QUARANTINE')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('mã bước của luồng khác → 400, không phải 409', async () => {
      const declaration = await startPastEntryGate(DeclarationType.IMPORT);
      await expect(decide(declaration, WorkflowStepCode.EXPORT_CUSTOMS, 'CUSTOMS')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('đúng bước nhưng sai lực lượng → 403', async () => {
      const declaration = await startPastEntryGate(DeclarationType.IMPORT);
      await expect(decide(declaration, WorkflowStepCode.IMPORT_BORDER, 'CUSTOMS')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('bước cổng ra dù đã tới lượt vẫn KHÔNG quyết định được qua decide → 409', async () => {
      const declaration = await startPastEntryGate(DeclarationType.IMPORT);
      // Chạy hết 4 bước liên ngành để hồ sơ đứng ở đúng bước cổng ra.
      for (const [stepCode, roleCode] of IMPORT_BUSINESS_FLOW) await decide(declaration, stepCode, roleCode);

      const promise = decide(declaration, WorkflowStepCode.IMPORT_B2_EXIT, 'BORDER_GUARD');
      await expect(promise).rejects.toBeInstanceOf(ConflictException);
      await expect(promise).rejects.toThrow('bước cổng');
      // Không advance: hồ sơ vẫn đủ điều kiện ra cổng, phiên chưa đóng.
      expect(declaration.status).toBe(DeclarationStatus.READY_FOR_EXIT);
      expect((await instances.findByDossierId(declaration.id))?.status).toBe(WorkflowInstanceStatus.IN_PROGRESS);
    });

    it('hồ sơ còn là bản nháp thì chưa vào được quy trình', async () => {
      const declaration = makeDeclaration({ id: 'decl-nhap-nhap', type: DeclarationType.IMPORT, status: DeclarationStatus.DRAFT });
      await declarations.save(declaration);
      await expect(decide(declaration, WorkflowStepCode.IMPORT_BORDER, 'BORDER_GUARD')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Ghi chú (nội dung lý do) bắt buộc, mã nguyên nhân tùy chọn (CR37)
  // ---------------------------------------------------------------------------
  describe('Ghi chú bắt buộc, mã nguyên nhân tùy chọn (CR37)', () => {
    const start = () => startPastEntryGate(DeclarationType.IMPORT);

    it.each([WorkflowDecision.REQUEST_SUPPLEMENT, WorkflowDecision.REJECT])(
      'thiếu ghi chú (nội dung lý do) khi %s → 400 kèm thông báo tiếng Việt',
      async (decision) => {
        const declaration = await start();
        const promise = decide(declaration, WorkflowStepCode.IMPORT_BORDER, 'BORDER_GUARD', { decision });
        await expect(promise).rejects.toBeInstanceOf(BadRequestException);
        await expect(promise).rejects.toThrow('bắt buộc phải nhập nội dung lý do');
      },
    );

    it.each([WorkflowDecision.REQUEST_SUPPLEMENT, WorkflowDecision.REJECT])(
      'chỉ cần ghi chú, KHÔNG cần mã nguyên nhân khi %s (mã lý do tùy chọn)',
      async (decision) => {
        const declaration = await start();
        await expect(
          decide(declaration, WorkflowStepCode.IMPORT_BORDER, 'BORDER_GUARD', {
            decision,
            reasonNote: 'Cần bổ sung/từ chối vì lý do nghiệp vụ.',
          }),
        ).resolves.toBeDefined();
      },
    );

    it('mã nguyên nhân đã chọn nhưng không có trong danh mục → 400', async () => {
      const declaration = await start();
      await expect(
        decide(declaration, WorkflowStepCode.IMPORT_BORDER, 'BORDER_GUARD', {
          decision: WorkflowDecision.REJECT,
          reasonCode: 'KHONG_CO',
          reasonNote: 'Từ chối vì sai lệch hồ sơ',
        }),
      ).rejects.toThrow('không có trong danh mục đang hiệu lực');
    });

    it('xác nhận hoàn thành KHÔNG bắt buộc ghi chú hay mã nguyên nhân', async () => {
      const declaration = await start();
      await expect(
        decide(declaration, WorkflowStepCode.IMPORT_BORDER, 'BORDER_GUARD', { decision: WorkflowDecision.APPROVE }),
      ).resolves.toBeDefined();
    });

    it('CR44 luật #2 — yêu cầu bổ sung trong cụm chỉ đóng băng bước đó, không đóng băng cả phiên', async () => {
      const declaration = await start();
      await decide(declaration, WorkflowStepCode.IMPORT_BORDER, 'BORDER_GUARD', {
        decision: WorkflowDecision.REQUEST_SUPPLEMENT,
        reasonCode: 'BS01',
        reasonNote: 'Bổ sung chứng từ xuất xứ',
      });

      // Đang ở cụm nghiệp vụ có bước chờ bổ sung → hồ sơ chuyển sang REVISION_REQUIRED để mở quyền sửa cho DN.
      expect(declaration.status).toBe(DeclarationStatus.REVISION_REQUIRED);
      const instance = await instances.findByDossierId(declaration.id);
      expect(instance?.status).toBe(WorkflowInstanceStatus.IN_PROGRESS);
      // Chỉ bước Biên phòng chờ bổ sung; Kiểm dịch + Hải quan vẫn mở.
      expect(instance?.step(WorkflowStepCode.IMPORT_BORDER)?.status).toBe(WorkflowStepStatus.WAITING_SUPPLEMENT);
      expect(instance?.activeStepCodes).toEqual(
        expect.arrayContaining([
          WorkflowStepCode.IMPORT_BORDER,
          WorkflowStepCode.IMPORT_QUARANTINE,
          WorkflowStepCode.IMPORT_CUSTOMS,
        ]),
      );
    });

    it('yêu cầu bổ sung ở bước ĐƠN (thu phí) đóng băng cả phiên và mở khóa DN sửa hồ sơ', async () => {
      const declaration = await start();
      // Chạy hết cụm nghiệp vụ để hồ sơ đứng ở bước thu phí (bước đơn, ngoài cụm).
      for (const [stepCode, roleCode] of IMPORT_BUSINESS_FLOW.slice(0, -1)) {
        await decide(declaration, stepCode, roleCode);
      }
      const [FEE_STEP, FEE_ROLE] = IMPORT_BUSINESS_FLOW[IMPORT_BUSINESS_FLOW.length - 1];

      await decide(declaration, FEE_STEP, FEE_ROLE, {
        decision: WorkflowDecision.REQUEST_SUPPLEMENT,
        reasonCode: 'BS01',
        reasonNote: 'Bổ sung chứng từ tại bước phí',
      });

      expect(declaration.status).toBe(DeclarationStatus.REVISION_REQUIRED);
      expect(declaration.isEditable).toBe(true);
      const instance = await instances.findByDossierId(declaration.id);
      expect(instance?.status).toBe(WorkflowInstanceStatus.WAITING_SUPPLEMENT);
      expect(instance?.currentStepCode).toBe(FEE_STEP);
    });

    it('chỉ có quyền workflow.update thì được yêu cầu bổ sung nhưng không được duyệt', async () => {
      const declaration = await start();
      await expect(
        decide(declaration, WorkflowStepCode.IMPORT_BORDER, 'BORDER_GUARD', {
          permissions: ['workflow.view', 'workflow.update'],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      await expect(
        decide(declaration, WorkflowStepCode.IMPORT_BORDER, 'BORDER_GUARD', {
          decision: WorkflowDecision.REQUEST_SUPPLEMENT,
          reasonCode: 'BS01',
          reasonNote: 'Bổ sung chứng từ xuất xứ',
          permissions: ['workflow.view', 'workflow.update'],
        }),
      ).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Ghi nhận thời gian xử lý (F26) và dấu vết thao tác
  // ---------------------------------------------------------------------------
  describe('Ghi nhận thời gian và dấu vết (F26)', () => {
    it('mỗi bước có mốc vào/ra và tổng thời gian hồ sơ được tính từ lúc gửi', async () => {
      const declaration = await startPastEntryGate(DeclarationType.IMPORT);

      const result = await decide(declaration, WorkflowStepCode.IMPORT_BORDER, 'BORDER_GUARD');
      const step = result.instance.steps.find((item) => item.code === WorkflowStepCode.IMPORT_BORDER);

      expect(step?.enteredAt).toEqual(SUBMITTED_AT);
      expect(step?.completedAt).toBeInstanceOf(Date);
      expect(step?.elapsedSeconds).toBeGreaterThanOrEqual(0);
      expect(result.instance.totalElapsedSeconds).toBeGreaterThan(0);
      // Bước kế tiếp bắt đầu đếm giờ ngay khi bước trước kết thúc.
      expect(result.instance.steps.find((item) => item.code === WorkflowStepCode.IMPORT_QUARANTINE)?.enteredAt).toBeInstanceOf(Date);
    });

    it('ghi tên người thao tác, mã lý do và số giây giữ hồ sơ vào nhật ký lực lượng', async () => {
      const declaration = await startPastEntryGate(DeclarationType.IMPORT);
      await decide(declaration, WorkflowStepCode.IMPORT_BORDER, 'BORDER_GUARD', {
        decision: WorkflowDecision.REQUEST_SUPPLEMENT,
        reasonCode: 'BS02',
        reasonNote: 'Bổ sung thông tin phương tiện',
      });

      const [action] = instances.actions;
      expect(action.actorName).toBe('Nguyễn Văn Kiểm');
      expect(action.agencyCode).toBe('BORDER_GUARD');
      expect(action.reasonCode).toBe('BS02');
      expect(action.elapsedSeconds).toBeGreaterThanOrEqual(0);
      expect(audit.entries[0].action).toBe('WORKFLOW_DECIDE');
      expect(notifications.published[0].type).toBe('DOSSIER_SUPPLEMENT_REQUESTED');
      expect(notifications.published[0].titleKey).toBe('notification.workflowSupplementTitle');
      expect(notifications.published[0].contentKey).toBe('notification.workflowSupplementContentWithNote');
      expect(notifications.published[0].route).toBe(`/declarations/${declaration.id}`);
    });

    it('phát thông báo rõ ràng khi từ chối hồ sơ (REJECT)', async () => {
      const declaration = await startPastEntryGate(DeclarationType.IMPORT);
      notifications.published.length = 0;

      await decide(declaration, WorkflowStepCode.IMPORT_CUSTOMS, 'CUSTOMS', {
        decision: WorkflowDecision.REJECT,
        reasonCode: 'TC01',
        reasonNote: 'Hàng hóa sai chủng loại khai báo',
      });

      const notif = notifications.published.find((n) => n.type === 'DOSSIER_REJECTED');
      expect(notif).toBeDefined();
      expect(notif?.titleKey).toBe('notification.workflowRejectedTitle');
      expect(notif?.contentKey).toBe('notification.workflowRejectedContentWithNote');
      expect(notif?.route).toBe(`/declarations/${declaration.id}`);
    });

    it('phát thông báo rõ ràng khi xác nhận hoàn thành bước (APPROVE)', async () => {
      const declaration = await startPastEntryGate(DeclarationType.IMPORT);
      notifications.published.length = 0;

      await decide(declaration, WorkflowStepCode.IMPORT_QUARANTINE, 'QUARANTINE', {
        decision: WorkflowDecision.APPROVE,
      });

      const notif = notifications.published.find((n) => n.type === 'DOSSIER_STEP_CONFIRMED');
      expect(notif).toBeDefined();
      expect(notif?.titleKey).toBe('notification.workflowApprovedTitle');
      expect(notif?.titleParams).toEqual({ code: declaration.code, agency: 'workflow.agency.QUARANTINE' });
      expect(notif?.contentKey).toBe('notification.workflowApprovedContent');
      expect(notif?.route).toBe(`/declarations/${declaration.id}`);

      const turnNotifs = notifications.published.filter((n) => n.type === 'DOSSIER_TURN_PROCESSING');
      expect(turnNotifs.length).toBeGreaterThan(0);
      for (const turnNotif of turnNotifs) {
        expect(turnNotif.route).toBe(`/workflow/dossiers/${declaration.id}`);
      }
    });

    it('checklist gửi kèm quyết định được lưu lại cho hồ sơ', async () => {
      const declaration = await startPastEntryGate(DeclarationType.IMPORT);

      await useCase.execute({
        dossierId: declaration.id,
        stepCode: WorkflowStepCode.IMPORT_BORDER,
        decision: WorkflowDecision.APPROVE,
        checklist: [{ code: 'BP_GIAY_TO_NGUOI', checked: true, note: 'Đã đối chiếu hộ chiếu' }],
        actorId: 'user-border_guard',
        actorRole: 'DISPATCHER',
        access: makeAgencyAccess('BORDER_GUARD'),
      });

      expect(await checklists.listStates(declaration.id)).toEqual([
        { code: 'BP_GIAY_TO_NGUOI', checked: true, note: 'Đã đối chiếu hộ chiếu' },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Bước thu phí bị chặn khi chưa thanh toán đủ (F48)
  // ---------------------------------------------------------------------------
  // Điều kiện tài chính có **một nguồn sự thật duy nhất** là `settlement` (giao dịch đã xác nhận),
  // không phải cột phí cũ. Cơ quan thu phí chỉ DUYỆT được bước phí khi hồ sơ đã thu đủ.
  describe('Bước thu phí chỉ duyệt được khi đã thu đủ (F48)', () => {
    const [FEE_STEP, FEE_ROLE] = IMPORT_BUSINESS_FLOW[IMPORT_BUSINESS_FLOW.length - 1];

    /** Chạy hết các bước liên ngành trước bước phí, để hồ sơ đứng đúng ở bước thu phí. */
    const advanceToFeeStep = async () => {
      const declaration = await startPastEntryGate(DeclarationType.IMPORT);
      for (const [stepCode, roleCode] of IMPORT_BUSINESS_FLOW.slice(0, -1)) {
        await decide(declaration, stepCode, roleCode);
      }
      expect(declaration.status).toBe(DeclarationStatus.WAITING_FOR_FEE);
      return declaration;
    };

    it('còn nợ phí thì duyệt bước phí bị chặn → 409, hồ sơ đứng yên tại bước phí', async () => {
      const declaration = await advanceToFeeStep();
      settlements.owes(500_000);

      const promise = decide(declaration, FEE_STEP, FEE_ROLE);
      await expect(promise).rejects.toBeInstanceOf(ConflictException);
      await expect(promise).rejects.toThrow('chưa được xác nhận thanh toán');
      // Bị chặn trước khi ghi phiên: không sang bước cổng, không ghi thêm nhật ký ở bước phí.
      expect(declaration.status).toBe(DeclarationStatus.WAITING_FOR_FEE);
      expect((await instances.findByDossierId(declaration.id))?.currentStepCode).toBe(FEE_STEP);
      expect(instances.actions).toHaveLength(IMPORT_BUSINESS_FLOW.length - 1);
    });

    it('đã thu đủ thì duyệt bước phí qua, phiên chuyển sang bước cổng', async () => {
      const declaration = await advanceToFeeStep();
      settlements.owes(0);

      await decide(declaration, FEE_STEP, FEE_ROLE);

      expect(declaration.status).toBe(DeclarationStatus.READY_FOR_EXIT);
      expect((await instances.findByDossierId(declaration.id))?.currentStepCode).toBe(IMPORT_EXIT_GATE);
    });

    it('còn nợ phí nhưng YÊU CẦU BỔ SUNG ở bước phí KHÔNG bị chặn bởi điều kiện tài chính', async () => {
      const declaration = await advanceToFeeStep();
      settlements.owes(500_000);

      await expect(
        decide(declaration, FEE_STEP, FEE_ROLE, {
          decision: WorkflowDecision.REQUEST_SUPPLEMENT,
          reasonCode: 'BS01',
          reasonNote: 'Bổ sung chứng từ tại bước phí',
        }),
      ).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Tự động tính phí khi hồ sơ vừa tới bước thu phí (quyết định chủ dự án)
  // ---------------------------------------------------------------------------
  describe('Tự tính phí khi vừa tới bước thu phí', () => {
    const [FEE_STEP, FEE_ROLE] = IMPORT_BUSINESS_FLOW[IMPORT_BUSINESS_FLOW.length - 1];

    const advanceToFeeStep = async () => {
      const declaration = await startPastEntryGate(DeclarationType.IMPORT);
      for (const [stepCode, roleCode] of IMPORT_BUSINESS_FLOW.slice(0, -1)) {
        await decide(declaration, stepCode, roleCode);
      }
      return declaration;
    };

    it('duyệt bước ngay trước bước phí thì cổng tự tính phí được gọi đúng một lần', async () => {
      const declaration = await advanceToFeeStep();

      expect(declaration.status).toBe(DeclarationStatus.WAITING_FOR_FEE);
      expect(feeCalculator.calls).toEqual([declaration.id]);

      const feeNotification = notifications.published.find(
        (n) => n.type === 'DOSSIER_TURN_PROCESSING' && n.recipientRoleCodes?.includes('FEE_COLLECTOR'),
      );
      expect(feeNotification).toBeDefined();
      expect(feeNotification?.contentKey).toBe('notification.dossierTurnProcessingFeeContent');
      expect(feeNotification?.contentParams).toEqual({ code: declaration.code });
      expect(feeNotification?.route).toBe(`/declarations/${declaration.id}/fees`);
    });

    it('các bước trước khi tới bước phí KHÔNG kích hoạt tự tính phí', async () => {
      const declaration = await startPastEntryGate(DeclarationType.IMPORT);
      // Hai bước đầu (biên phòng → kiểm dịch) chưa đưa hồ sơ tới bước thu phí.
      for (const [stepCode, roleCode] of IMPORT_BUSINESS_FLOW.slice(0, 2)) {
        await decide(declaration, stepCode, roleCode);
      }

      expect(feeCalculator.calls).toHaveLength(0);
    });

    it('duyệt tiếp khi đã đứng ở bước phí KHÔNG gọi tự tính lại (idempotent theo lần "vừa tới")', async () => {
      const declaration = await advanceToFeeStep();
      feeCalculator.calls.length = 0;
      settlements.owes(0);

      await decide(declaration, FEE_STEP, FEE_ROLE);

      expect(feeCalculator.calls).toHaveLength(0);
    });

    it('tự tính phí lỗi KHÔNG làm hỏng quyết định bước (best-effort)', async () => {
      const declaration = await startPastEntryGate(DeclarationType.IMPORT);
      for (const [stepCode, roleCode] of IMPORT_BUSINESS_FLOW.slice(0, 2)) {
        await decide(declaration, stepCode, roleCode);
      }
      feeCalculator.failWith(new Error('Kho phí tạm thời không truy cập được'));

      // Bước đưa hồ sơ tới bước phí vẫn phải thành công dù cổng tính phí ném lỗi.
      const [stepCode, roleCode] = IMPORT_BUSINESS_FLOW[2];
      await expect(decide(declaration, stepCode, roleCode)).resolves.toBeDefined();
      expect(declaration.status).toBe(DeclarationStatus.WAITING_FOR_FEE);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. CR44 luật #2 — yêu cầu bổ sung per-step KHÔNG chặn 2 lực lượng còn lại
  // ---------------------------------------------------------------------------
  describe('CR44 — yêu cầu bổ sung trong cụm không đóng băng lực lượng khác', () => {
    it('sau khi Biên phòng yêu cầu bổ sung, Kiểm dịch và Hải quan vẫn quyết định được (không 409)', async () => {
      const declaration = await startPastEntryGate(DeclarationType.IMPORT);
      await decide(declaration, WorkflowStepCode.IMPORT_BORDER, 'BORDER_GUARD', {
        decision: WorkflowDecision.REQUEST_SUPPLEMENT,
        reasonCode: 'BS01',
        reasonNote: 'Bổ sung chứng từ xuất xứ',
      });

      // Hai lực lượng còn lại không bị chặn bởi việc Biên phòng đang chờ bổ sung.
      await expect(decide(declaration, WorkflowStepCode.IMPORT_QUARANTINE, 'QUARANTINE')).resolves.toBeDefined();
      await expect(decide(declaration, WorkflowStepCode.IMPORT_CUSTOMS, 'CUSTOMS')).resolves.toBeDefined();

      const instance = await instances.findByDossierId(declaration.id);
      // Biên phòng vẫn chờ bổ sung; cụm chưa xong (còn bước này) → phiên IN_PROGRESS, hồ sơ mang REVISION_REQUIRED.
      expect(instance?.step(WorkflowStepCode.IMPORT_BORDER)?.status).toBe(WorkflowStepStatus.WAITING_SUPPLEMENT);
      expect(instance?.status).toBe(WorkflowInstanceStatus.IN_PROGRESS);
      expect(declaration.status).toBe(DeclarationStatus.REVISION_REQUIRED);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. CR2 — cờ dịch tễ: Kiểm dịch tiên quyết, rồi Biên phòng + Hải quan song song
  // ---------------------------------------------------------------------------
  describe('CR2 — cờ dịch tễ khiến Kiểm dịch tiên quyết (đầu-cuối ở tầng use-case)', () => {
    it.each([
      [WorkflowStepCode.IMPORT_BORDER, 'BORDER_GUARD'],
      [WorkflowStepCode.IMPORT_CUSTOMS, 'CUSTOMS'],
    ])('Biên phòng/Hải quan bị 409 khi đòi xử lý bước %s trước khi Kiểm dịch xong', async (stepCode, roleCode) => {
      const declaration = await startPastEntryGateWithEpidemic(DeclarationType.IMPORT);

      const promise = decide(declaration, stepCode, roleCode);
      await expect(promise).rejects.toBeInstanceOf(ConflictException);
      await expect(promise).rejects.toThrow('ưu tiên kiểm dịch');
      // Bị chặn trước khi ghi phiên: không có nhật ký lực lượng nào.
      expect(instances.actions).toHaveLength(0);
    });

    it('chỉ Kiểm dịch mở lúc đầu; hoàn thành Kiểm dịch mở khóa Biên phòng + Hải quan song song rồi chạy tới đủ điều kiện ra cổng', async () => {
      const declaration = await startPastEntryGateWithEpidemic(DeclarationType.IMPORT);

      const before = await instances.findByDossierId(declaration.id);
      expect(before?.activeStepCodes).toEqual([WorkflowStepCode.IMPORT_QUARANTINE]);

      // Kiểm dịch thao tác được ngay.
      await decide(declaration, WorkflowStepCode.IMPORT_QUARANTINE, 'QUARANTINE');
      const afterQuarantine = await instances.findByDossierId(declaration.id);
      expect(afterQuarantine?.activeStepCodes).toEqual([
        WorkflowStepCode.IMPORT_BORDER,
        WorkflowStepCode.IMPORT_CUSTOMS,
      ]);
      expect(declaration.status).toBe(DeclarationStatus.BUSINESS_PROCESSING);

      // Biên phòng + Hải quan giờ song song, không còn bị chặn.
      await expect(decide(declaration, WorkflowStepCode.IMPORT_BORDER, 'BORDER_GUARD')).resolves.toBeDefined();
      await decide(declaration, WorkflowStepCode.IMPORT_CUSTOMS, 'CUSTOMS');
      expect(declaration.status).toBe(DeclarationStatus.WAITING_FOR_FEE);

      // Thu phí xong → đủ điều kiện ra cổng.
      await decide(declaration, WorkflowStepCode.IMPORT_FEE, 'FEE_COLLECTOR');
      expect(declaration.status).toBe(DeclarationStatus.READY_FOR_EXIT);
    });

    it('khi Kiểm dịch từ chối hồ sơ dịch tễ, không gửi thông báo cho Biên phòng hay Hải quan trừ Admin', async () => {
      const declaration = await startPastEntryGateWithEpidemic(DeclarationType.IMPORT);
      notifications.published.length = 0;

      await decide(declaration, WorkflowStepCode.IMPORT_QUARANTINE, 'QUARANTINE', {
        decision: WorkflowDecision.REJECT,
        reasonCode: 'TC01',
        reasonNote: 'Không đạt tiêu chuẩn kiểm dịch',
      });

      const notif = notifications.published.find((n) => n.type === 'DOSSIER_REJECTED');
      expect(notif).toBeDefined();
      expect(notif?.recipientRoleCodes).toEqual(['SYS_ADMIN', 'ADMIN']);
      expect(notifications.published.filter((n) => n.type === 'DOSSIER_TURN_PROCESSING')).toHaveLength(0);
    });
  });
});
