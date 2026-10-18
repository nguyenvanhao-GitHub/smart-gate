import { DeclarationStatus, DeclarationType, WorkflowStepCode } from '../../declarations/domain/declaration.enums';
import { makeRoute, seedStepRoleRows } from '../testing/workflow.fixture';
import { WorkflowInstance } from './workflow-instance.entity';
import { availableDecisions, checkStepAction, checkStepOrder } from './workflow-order.rules';
import { dossierStatusFor } from './workflow-status.rules';
import { buildWorkflowRoute, WorkflowRoute } from './workflow-route';
import { WorkflowDecision, WorkflowInstanceStatus, WorkflowStepStatus } from './workflow.enums';

describe('Quy tắc thứ tự bước (đọc từ workflow_step_roles)', () => {
  const startedAt = new Date('2026-07-22T08:00:00.000Z');

  describe('BUG-049 — bước khai báo mang tên người/DN đã khai, không phải "Hệ thống"', () => {
    it('start() với tên người khai gán actorName cho bước khai báo (ENTERPRISE)', () => {
      const route = makeRoute(DeclarationType.IMPORT);
      const instance = WorkflowInstance.start('decl-01', DeclarationType.IMPORT, route, startedAt, 'Cty CP Nông sản Tây Bắc');
      const declared = instance.step(WorkflowStepCode.IMPORT_DECLARED);
      expect(declared?.actorName).toBe('Cty CP Nông sản Tây Bắc');
      expect(declared?.completedAt).toEqual(startedAt);
    });

    it('không truyền tên người khai thì actorName vẫn null (tương thích cũ)', () => {
      const route = makeRoute(DeclarationType.IMPORT);
      const instance = WorkflowInstance.start('decl-01', DeclarationType.IMPORT, route, startedAt);
      expect(instance.step(WorkflowStepCode.IMPORT_DECLARED)?.actorName).toBeNull();
    });
  });

  describe('buildWorkflowRoute — thứ tự lấy từ dữ liệu, không cố định trong mã', () => {
    it('luồng xuất đi đúng thứ tự SRS 4.2: Biên phòng sơ bộ → Hải quan → Kiểm dịch → Biên phòng xuất cảnh', () => {
      const route = makeRoute(DeclarationType.EXPORT);
      expect(route.steps.map((step) => step.code)).toEqual([
        WorkflowStepCode.EXPORT_DECLARED,
        WorkflowStepCode.EXPORT_B2_ENTRY,
        WorkflowStepCode.EXPORT_CUSTOMS,
        WorkflowStepCode.EXPORT_QUARANTINE,
        WorkflowStepCode.EXPORT_BORDER,
        WorkflowStepCode.EXPORT_FEE,
        WorkflowStepCode.EXPORT_B1_EXIT,
      ]);
    });

    it('luồng nhập: Biên phòng nhập cảnh → Biên phòng kiểm tra → Kiểm dịch → Hải quan → Phí → Cổng ra', () => {
      const route = makeRoute(DeclarationType.IMPORT);
      expect(route.steps.map((step) => step.code)).toEqual([
        WorkflowStepCode.IMPORT_DECLARED,
        WorkflowStepCode.IMPORT_B1_ENTRY,
        WorkflowStepCode.IMPORT_BORDER,
        WorkflowStepCode.IMPORT_QUARANTINE,
        WorkflowStepCode.IMPORT_CUSTOMS,
        WorkflowStepCode.IMPORT_FEE,
        WorkflowStepCode.IMPORT_B2_EXIT,
      ]);
    });

    it('sang tải đầu xuất đi cùng lộ trình xuất, sang tải đầu nhập và xe tự hành đi cùng lộ trình nhập', () => {
      expect(makeRoute(DeclarationType.TRANSSHIPMENT_EXPORT).steps.map((step) => step.code)).toEqual(
        makeRoute(DeclarationType.EXPORT).steps.map((step) => step.code),
      );
      expect(makeRoute(DeclarationType.TRANSSHIPMENT_IMPORT).steps.map((step) => step.code)).toEqual(
        makeRoute(DeclarationType.IMPORT).steps.map((step) => step.code),
      );
      expect(makeRoute(DeclarationType.SELF_PROPELLED).steps.map((step) => step.code)).toEqual(
        makeRoute(DeclarationType.IMPORT).steps.map((step) => step.code),
      );
    });

    it('đổi sort_order trong dữ liệu là đổi thứ tự bước, không phải sửa mã nguồn', () => {
      const rows = seedStepRoleRows().map((row) =>
        row.stepCode === WorkflowStepCode.EXPORT_CUSTOMS ? { ...row, sortOrder: 5 } : row,
      );
      const route = buildWorkflowRoute(DeclarationType.EXPORT, rows);
      expect(route.steps.map((step) => step.code)).toEqual([
        WorkflowStepCode.EXPORT_DECLARED,
        WorkflowStepCode.EXPORT_B2_ENTRY,
        WorkflowStepCode.EXPORT_QUARANTINE,
        WorkflowStepCode.EXPORT_BORDER,
        WorkflowStepCode.EXPORT_CUSTOMS,
        WorkflowStepCode.EXPORT_FEE,
        WorkflowStepCode.EXPORT_B1_EXIT,
      ]);
    });

    it('bỏ dòng khỏi dữ liệu là bỏ bước khỏi lộ trình', () => {
      const rows = seedStepRoleRows().filter((row) => row.stepCode !== WorkflowStepCode.EXPORT_QUARANTINE);
      const route = buildWorkflowRoute(DeclarationType.EXPORT, rows);
      expect(route.find(WorkflowStepCode.EXPORT_QUARANTINE)).toBeUndefined();
      expect(route.next(WorkflowStepCode.EXPORT_CUSTOMS)?.code).toBe(WorkflowStepCode.EXPORT_BORDER);
    });

    it('mã bước lạ trong dữ liệu bị bỏ qua, không làm hỏng lộ trình', () => {
      const rows = [...seedStepRoleRows(), { stepCode: 'EXPORT_KHONG_TON_TAI', roleCode: 'CUSTOMS', sortOrder: 2, force: null }];
      expect(buildWorkflowRoute(DeclarationType.EXPORT, rows).steps).toHaveLength(7);
    });
  });

  describe('checkStepOrder — chặn bỏ bước và làm lại bước', () => {
    const importInstance = () =>
      WorkflowInstance.start('decl-01', DeclarationType.IMPORT, makeRoute(DeclarationType.IMPORT), startedAt);

    it('hồ sơ vừa gửi thì bước hiện tại là bước xử lý đầu tiên, không phải bước khai báo', () => {
      const instance = importInstance();
      expect(instance.currentStepCode).toBe(WorkflowStepCode.IMPORT_B1_ENTRY);
      expect(checkStepOrder(makeRoute(DeclarationType.IMPORT), instance, WorkflowStepCode.IMPORT_B1_ENTRY)).toBeNull();
    });

    it.each([
      WorkflowStepCode.IMPORT_BORDER,
      WorkflowStepCode.IMPORT_QUARANTINE,
      WorkflowStepCode.IMPORT_CUSTOMS,
      WorkflowStepCode.IMPORT_FEE,
      WorkflowStepCode.IMPORT_B2_EXIT,
    ])('BỎ BƯỚC: gọi thẳng bước %s khi chưa tới lượt bị chặn', (stepCode) => {
      const violation = checkStepOrder(makeRoute(DeclarationType.IMPORT), importInstance(), stepCode);
      expect(violation?.kind).toBe('OUT_OF_ORDER');
      expect(violation?.message).toContain('Sai thứ tự xử lý');
    });

    it('thông báo chặn nói rõ hồ sơ đang chờ lực lượng nào', () => {
      const violation = checkStepOrder(makeRoute(DeclarationType.IMPORT), importInstance(), WorkflowStepCode.IMPORT_CUSTOMS);
      expect(violation?.message).toContain('Biên phòng');
    });

    it('bước đã có kết luận thì không quyết định lại', () => {
      const route = makeRoute(DeclarationType.IMPORT);
      const instance = importInstance();
      instance.applyDecision(
        {
          stepCode: WorkflowStepCode.IMPORT_B1_ENTRY,
          decision: WorkflowDecision.APPROVE,
          actorId: 'user-1',
          actorName: null,
          reasonCode: null,
          reasonNote: null,
          at: startedAt,
        },
        route,
      );
      expect(checkStepOrder(route, instance, WorkflowStepCode.IMPORT_B1_ENTRY)?.kind).toBe('ALREADY_DECIDED');
    });

    it('mã bước của luồng khác bị coi là không thuộc quy trình', () => {
      const violation = checkStepOrder(makeRoute(DeclarationType.IMPORT), importInstance(), WorkflowStepCode.EXPORT_CUSTOMS);
      expect(violation?.kind).toBe('UNKNOWN_STEP');
    });

    it('hồ sơ đã bị từ chối hoặc đã xong quy trình thì đóng luôn', () => {
      const instance = importInstance();
      instance.status = WorkflowInstanceStatus.REJECTED;
      expect(checkStepOrder(makeRoute(DeclarationType.IMPORT), instance, WorkflowStepCode.IMPORT_B1_ENTRY)?.kind).toBe('FLOW_CLOSED');

      instance.status = WorkflowInstanceStatus.COMPLETED;
      expect(checkStepOrder(makeRoute(DeclarationType.IMPORT), instance, WorkflowStepCode.IMPORT_B1_ENTRY)?.kind).toBe('FLOW_CLOSED');
    });
  });

  describe('checkStepAction — vai trò được phép thao tác cũng lấy từ dữ liệu', () => {
    /** Đưa hồ sơ nhập qua bước cổng VÀO (do sự kiện cổng khép) để đứng ở bước Biên phòng kiểm tra. */
    const atBorderStep = (route: WorkflowRoute): WorkflowInstance => {
      const instance = WorkflowInstance.start('decl-01', DeclarationType.IMPORT, route, startedAt);
      instance.completeGateStep(route, false, 'canbo-cong', 'Cổng vào', startedAt);
      return instance;
    };

    it('đúng bước nhưng sai lực lượng thì bị chặn với nguyên nhân vai trò', () => {
      const route = makeRoute(DeclarationType.IMPORT);
      const instance = atBorderStep(route);
      expect(checkStepAction(route, instance, WorkflowStepCode.IMPORT_BORDER, ['CUSTOMS'])?.kind).toBe('ROLE_NOT_ALLOWED');
      expect(checkStepAction(route, instance, WorkflowStepCode.IMPORT_BORDER, ['BORDER_GUARD'])).toBeNull();
    });

    it('CR44 — trong cụm nghiệp vụ, ba bước mở song song, không chặn thứ tự nội bộ', () => {
      const route = makeRoute(DeclarationType.IMPORT);
      const instance = atBorderStep(route);
      // Cả ba lực lượng đều thao tác được ngay, không phải chờ nhau.
      expect(checkStepAction(route, instance, WorkflowStepCode.IMPORT_BORDER, ['BORDER_GUARD'])).toBeNull();
      expect(checkStepAction(route, instance, WorkflowStepCode.IMPORT_QUARANTINE, ['QUARANTINE'])).toBeNull();
      expect(checkStepAction(route, instance, WorkflowStepCode.IMPORT_CUSTOMS, ['CUSTOMS'])).toBeNull();
    });

    it('đòi thu phí khi cụm nghiệp vụ chưa xong hết → OUT_OF_ORDER (409)', () => {
      const route = makeRoute(DeclarationType.IMPORT);
      const instance = atBorderStep(route);
      expect(checkStepAction(route, instance, WorkflowStepCode.IMPORT_FEE, ['FEE_COLLECTOR'])?.kind).toBe('OUT_OF_ORDER');
    });

    it('chặn duyệt bước nghiệp vụ khi hồ sơ đang ở trạng thái Chờ gọi (WAITING_CALL)', () => {
      const route = makeRoute(DeclarationType.IMPORT);
      const instance = atBorderStep(route);
      const violation = checkStepAction(
        route,
        instance,
        WorkflowStepCode.IMPORT_BORDER,
        ['BORDER_GUARD'],
        false,
        DeclarationStatus.WAITING_CALL,
      );
      expect(violation?.kind).toBe('WAITING_CALL');
      expect(violation?.messageKey).toBe('workflow.waitingCall');

      expect(
        availableDecisions(
          route,
          instance,
          ['workflow.approve'],
          ['BORDER_GUARD'],
          false,
          DeclarationStatus.WAITING_CALL,
        ),
      ).toEqual([]);
    });

    it('cho phép duyệt bước nghiệp vụ khi hồ sơ chuyển sang trạng thái Đang xử lý nghiệp vụ (BUSINESS_PROCESSING)', () => {
      const route = makeRoute(DeclarationType.IMPORT);
      const instance = atBorderStep(route);
      expect(
        checkStepAction(
          route,
          instance,
          WorkflowStepCode.IMPORT_BORDER,
          ['BORDER_GUARD'],
          false,
          DeclarationStatus.BUSINESS_PROCESSING,
        ),
      ).toBeNull();

      expect(
        availableDecisions(
          route,
          instance,
          ['workflow.approve'],
          ['BORDER_GUARD'],
          false,
          DeclarationStatus.BUSINESS_PROCESSING,
        ),
      ).toEqual([WorkflowDecision.APPROVE, WorkflowDecision.REQUEST_SUPPLEMENT, WorkflowDecision.REJECT]);
    });

    it.each([
      WorkflowStepCode.IMPORT_B1_ENTRY,
      WorkflowStepCode.IMPORT_B2_EXIT,
    ])('bước cổng %s không quyết định được qua decide (khép bằng sự kiện cổng, CR7)', (gateStep) => {
      const route = makeRoute(DeclarationType.IMPORT);
      const instance = WorkflowInstance.start('decl-01', DeclarationType.IMPORT, route, startedAt);
      // Đưa hồ sơ đứng đúng ở bước cổng để loại trừ nguyên nhân "sai thứ tự".
      instance.enterStep(gateStep, startedAt);
      const violation = checkStepAction(route, instance, gateStep, ['BORDER_GUARD']);
      expect(violation?.kind).toBe('GATE_STEP');
      expect(violation?.message).toContain('bước cổng');
    });
  });

  describe('availableDecisions — tính theo quyền và vai trò của người đang đăng nhập', () => {
    const route = makeRoute(DeclarationType.IMPORT);
    /** Hồ sơ nhập đã qua bước cổng VÀO, đang đứng ở bước Biên phòng kiểm tra (bước liên ngành đầu). */
    const instance = () => {
      const inst = WorkflowInstance.start('decl-01', DeclarationType.IMPORT, route, startedAt);
      inst.completeGateStep(route, false, 'canbo-cong', 'Cổng vào', startedAt);
      return inst;
    };

    it('đủ quyền duyệt và đúng vai trò thì có 3 lựa chọn (CR36)', () => {
      expect(availableDecisions(route, instance(), ['workflow.approve'], ['BORDER_GUARD'])).toEqual([
        WorkflowDecision.APPROVE,
        WorkflowDecision.REQUEST_SUPPLEMENT,
        WorkflowDecision.REJECT,
      ]);
    });

    it('chỉ có workflow.update thì chỉ được yêu cầu sửa đổi, bổ sung', () => {
      expect(availableDecisions(route, instance(), ['workflow.update'], ['BORDER_GUARD'])).toEqual([
        WorkflowDecision.REQUEST_SUPPLEMENT,
      ]);
    });

    it('chỉ xem được thì không có lựa chọn nào', () => {
      expect(availableDecisions(route, instance(), ['workflow.view'], ['BORDER_GUARD'])).toEqual([]);
    });

    it('không có bước mở nào của vai trò thì không có lựa chọn nào (thu phí — cụm chưa xong)', () => {
      // Trong cụm nghiệp vụ, ba lực lượng kiểm tra đều có bước mở; cơ quan thu phí thì chưa (bước phí
      // còn PENDING) nên không có lựa chọn.
      expect(availableDecisions(route, instance(), ['workflow.approve'], ['FEE_COLLECTOR'])).toEqual([]);
    });

    it('CR44 — mỗi lực lượng kiểm tra thấy đúng 3 lựa chọn của bước mình dù cụm mở song song', () => {
      expect(availableDecisions(route, instance(), ['workflow.approve'], ['QUARANTINE'])).toEqual([
        WorkflowDecision.APPROVE,
        WorkflowDecision.REQUEST_SUPPLEMENT,
        WorkflowDecision.REJECT,
      ]);
      expect(availableDecisions(route, instance(), ['workflow.approve'], ['CUSTOMS'])).toEqual([
        WorkflowDecision.APPROVE,
        WorkflowDecision.REQUEST_SUPPLEMENT,
        WorkflowDecision.REJECT,
      ]);
    });

    it('ở bước cổng không còn quyết định nào của bước hiện tại (cổng hoàn thành bằng sự kiện cổng)', () => {
      const current = WorkflowInstance.start('decl-01', DeclarationType.IMPORT, route, startedAt);
      current.enterStep(WorkflowStepCode.IMPORT_B2_EXIT, startedAt);
      // Bước cổng do sự kiện cổng khép (CR7), không quyết định qua decide.
      expect(availableDecisions(route, current, ['workflow.approve'], ['BORDER_GUARD'])).toEqual([]);
    });

    // Phương án A: cấp `workflow.approve` + `workflow.update` cho FEE_COLLECTOR để họ đẩy được
    // chính bước thu phí (xem role.catalog.ts). Test cột này để chặn hồi quy quyền của cán bộ thu phí.
    it('cán bộ thu phí trên chính bước thu phí có đủ 3 quyết định', () => {
      const current = instance();
      current.enterStep(WorkflowStepCode.IMPORT_FEE, startedAt);
      expect(
        availableDecisions(route, current, ['workflow.approve', 'workflow.update'], ['FEE_COLLECTOR']),
      ).toEqual([
        WorkflowDecision.APPROVE,
        WorkflowDecision.REQUEST_SUPPLEMENT,
        WorkflowDecision.REJECT,
      ]);
    });

    it('cán bộ thu phí KHÔNG mở được bước của lực lượng khác dù có quyền duyệt', () => {
      const current = instance();
      current.enterStep(WorkflowStepCode.IMPORT_CUSTOMS, startedAt);
      expect(
        availableDecisions(route, current, ['workflow.approve', 'workflow.update'], ['FEE_COLLECTOR']),
      ).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // CR44 — cụm nghiệp vụ song song (Biên phòng / Kiểm dịch / Hải quan)
  // ---------------------------------------------------------------------------
  describe('CR44 — cụm nghiệp vụ chạy song song', () => {
    const route = makeRoute(DeclarationType.IMPORT);
    const decide = (instance: WorkflowInstance, stepCode: WorkflowStepCode, decision = WorkflowDecision.APPROVE) =>
      instance.applyDecision(
        { stepCode, decision, actorId: 'u', actorName: null, reasonCode: null, reasonNote: null, at: startedAt },
        route,
      );

    /** Hồ sơ nhập đã qua cổng vào → cả cụm nghiệp vụ mở song song. */
    const inCluster = (): WorkflowInstance => {
      const instance = WorkflowInstance.start('decl-01', DeclarationType.IMPORT, route, startedAt);
      instance.completeGateStep(route, false, 'canbo-cong', 'Cổng vào', startedAt);
      return instance;
    };

    it('duyệt từng bước độc lập; hồ sơ chỉ rời cụm khi CẢ ba bước xong', () => {
      const instance = inCluster();
      decide(instance, WorkflowStepCode.IMPORT_QUARANTINE);
      // Còn Biên phòng + Hải quan mở → chưa rời cụm, trạng thái "Đang xử lý nghiệp vụ".
      expect(instance.activeStepCodes).toEqual([WorkflowStepCode.IMPORT_BORDER, WorkflowStepCode.IMPORT_CUSTOMS]);
      expect(instance.status).toBe(WorkflowInstanceStatus.IN_PROGRESS);
      expect(dossierStatusFor(instance, route)).toBe(DeclarationStatus.BUSINESS_PROCESSING);

      decide(instance, WorkflowStepCode.IMPORT_BORDER);
      decide(instance, WorkflowStepCode.IMPORT_CUSTOMS);
      // Cụm xong → sang bước thu phí.
      expect(instance.currentStepCode).toBe(WorkflowStepCode.IMPORT_FEE);
      expect(dossierStatusFor(instance, route)).toBe(DeclarationStatus.WAITING_FOR_FEE);
    });

    it('luật #2 — yêu cầu bổ sung đóng băng bước đó (bán cán bộ không quyết định lại) và đặt hồ sơ sang REVISION_REQUIRED để doanh nghiệp sửa', () => {
      const instance = inCluster();
      decide(instance, WorkflowStepCode.IMPORT_BORDER, WorkflowDecision.REQUEST_SUPPLEMENT);
      expect(instance.step(WorkflowStepCode.IMPORT_BORDER)?.status).toBe(WorkflowStepStatus.WAITING_SUPPLEMENT);
      // Bước bị yêu cầu bổ sung → cán bộ không quyết định lại được (trả về STEP_WAITING_SUPPLEMENT).
      expect(checkStepAction(route, instance, WorkflowStepCode.IMPORT_BORDER, ['BORDER_GUARD'])?.kind).toBe(
        'STEP_WAITING_SUPPLEMENT',
      );
      expect(availableDecisions(route, instance, ['workflow.approve'], ['BORDER_GUARD'])).toEqual([]);
      // Hồ sơ chuyển sang "Cần bổ sung" để mở quyền sửa cho doanh nghiệp.
      expect(dossierStatusFor(instance, route)).toBe(DeclarationStatus.REVISION_REQUIRED);
    });

    it('luật #3 — một lực lượng từ chối thì cả hồ sơ REJECTED', () => {
      const instance = inCluster();
      decide(instance, WorkflowStepCode.IMPORT_CUSTOMS, WorkflowDecision.REJECT);
      expect(instance.status).toBe(WorkflowInstanceStatus.REJECTED);
      expect(dossierStatusFor(instance, route)).toBe(DeclarationStatus.REJECTED);
    });
  });

  // ---------------------------------------------------------------------------
  // CR2 — ưu tiên kiểm dịch (dịch tễ): Kiểm dịch tiên quyết, sau đó BP + HQ song song
  // ---------------------------------------------------------------------------
  describe('CR2 — cờ dịch tễ khiến Kiểm dịch tiên quyết', () => {
    const route = makeRoute(DeclarationType.IMPORT);

    /** Hồ sơ nhập có cờ dịch tễ, đã qua cổng vào → chỉ Kiểm dịch mở, BP/HQ chờ. */
    const withEpidemic = (): WorkflowInstance => {
      const instance = WorkflowInstance.start('decl-01', DeclarationType.IMPORT, route, startedAt);
      instance.completeGateStep(route, true, 'canbo-cong', 'Cổng vào', startedAt);
      return instance;
    };

    it('vào cụm chỉ mở Kiểm dịch; Biên phòng/Hải quan bị chặn 409 tới khi Kiểm dịch xong', () => {
      const instance = withEpidemic();
      expect(instance.activeStepCodes).toEqual([WorkflowStepCode.IMPORT_QUARANTINE]);
      expect(checkStepAction(route, instance, WorkflowStepCode.IMPORT_BORDER, ['BORDER_GUARD'], true)?.kind).toBe(
        'QUARANTINE_PRIORITY',
      );
      expect(checkStepAction(route, instance, WorkflowStepCode.IMPORT_CUSTOMS, ['CUSTOMS'], true)?.kind).toBe(
        'QUARANTINE_PRIORITY',
      );
      // Kiểm dịch vẫn thao tác được ngay.
      expect(checkStepAction(route, instance, WorkflowStepCode.IMPORT_QUARANTINE, ['QUARANTINE'], true)).toBeNull();
    });

    it('hoàn thành Kiểm dịch mở khóa Biên phòng + Hải quan song song với nhau', () => {
      const instance = withEpidemic();
      instance.applyDecision(
        {
          stepCode: WorkflowStepCode.IMPORT_QUARANTINE,
          decision: WorkflowDecision.APPROVE,
          actorId: 'u',
          actorName: null,
          reasonCode: null,
          reasonNote: null,
          at: startedAt,
        },
        route,
        true,
      );
      expect(instance.activeStepCodes).toEqual([WorkflowStepCode.IMPORT_BORDER, WorkflowStepCode.IMPORT_CUSTOMS]);
      expect(checkStepAction(route, instance, WorkflowStepCode.IMPORT_BORDER, ['BORDER_GUARD'], true)).toBeNull();
      expect(checkStepAction(route, instance, WorkflowStepCode.IMPORT_CUSTOMS, ['CUSTOMS'], true)).toBeNull();
    });
  });
});
