import { ForbiddenException } from '@nestjs/common';
import { FeeSettlementSnapshot } from '../../../common/fees/fee-settlement.port';
import {
  CheckpointCode,
  DeclarationStatus,
  DeclarationType,
  WorkflowStepCode,
} from '../domain/declaration.enums';
import { makeDeclaration } from '../testing/declaration.fixture';
import { WorkflowInstance } from '../../workflow/domain/workflow-instance.entity';
import { WorkflowDecision } from '../../workflow/domain/workflow.enums';
import { WorkflowRouteService } from '../../workflow/application/services/workflow-route.service';
import {
  FakeStepDirectory,
  InMemoryWorkflowInstanceRepository,
  makeApprovedInstance,
  makeRoute,
} from '../../workflow/testing/workflow.fixture';
import { GateEvaluation, WorkflowPolicyService } from './workflow-policy.service';

/**
 * Từ P3, lớp này **không còn giữ bảng vai trò cứng** `UserRoleCode × lực lượng`: vai trò nào được
 * xử lý bước nào là dữ liệu trong bảng `workflow_step_roles`.
 *
 * Độ phủ nghiệp vụ tương ứng đã chuyển chỗ, không mất:
 * - **thứ tự bước liên ngành** và **chặn bỏ bước** → `workflow/domain/workflow-order.rules.spec.ts`
 *   (`checkStepOrder`) và `workflow/application/use-cases/decide-workflow-step.use-case.spec.ts`
 *   (bắn thẳng API sai thứ tự → 409);
 * - **phân quyền theo lực lượng của từng bước** → cùng hai tệp trên (`checkStepAction` → 403,
 *   `availableDecisions` theo quyền + vai trò);
 * - **ánh xạ bước ↔ lực lượng** → `buildWorkflowRoute` đọc từ danh mục `workflow_step_roles`.
 *
 * Phần còn lại kiểm ở đây: kiểm **vai trò** thu phí, tiện ích `isExportLike`, và **quy tắc mở cổng**
 * — tài sản nghiệp vụ chính của lớp này. Ma trận thứ tự lực lượng cũ dựa cột `forceProgress` đã bị gỡ
 * cùng chính cột đó (LÔ 5); thứ tự bước nay do phiên xử lý liên ngành bảo đảm (xem các spec workflow).
 */
describe('WorkflowPolicyService', () => {
  let service: WorkflowPolicyService;
  let instances: InMemoryWorkflowInstanceRepository;

  beforeEach(() => {
    // `assertCanConfirmFee` không chạm phiên xử lý; `evaluateGate` thì đọc phiên qua repo + lộ trình
    // từ danh mục seed (`FakeStepDirectory`).
    instances = new InMemoryWorkflowInstanceRepository();
    service = new WorkflowPolicyService(instances, new WorkflowRouteService(new FakeStepDirectory()));
  });

  // ---------------------------------------------------------------------------
  // 1. Tiện ích phân nhánh luồng
  // ---------------------------------------------------------------------------
  describe('isExportLike', () => {
    it('phân nhánh đúng cho cả bốn loại hình hồ sơ', () => {
      expect(service.isExportLike(DeclarationType.EXPORT)).toBe(true);
      expect(service.isExportLike(DeclarationType.TRANSSHIPMENT_EXPORT)).toBe(true);
      expect(service.isExportLike(DeclarationType.TRANSSHIPMENT_IMPORT)).toBe(false);
      expect(service.isExportLike(DeclarationType.IMPORT)).toBe(false);
      expect(service.isExportLike(DeclarationType.SELF_PROPELLED)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Phí — chỉ còn kiểm VAI TRÒ (thứ tự bước do phiên xử lý liên ngành bảo đảm)
  // ---------------------------------------------------------------------------
  describe('assertCanConfirmFee', () => {
    // Vai trò RBAC (nguồn sự thật): thu phí (`FEE_COLLECTOR`) và quản trị (`SYS_ADMIN`) được xác nhận
    // phí. RBAC không phân biệt phí Thuế/Sang tải bằng mã vai trò — đó là việc của phạm vi phân công.
    const FEE_COLLECTOR = ['FEE_COLLECTOR'];
    const SYS_ADMIN = ['SYS_ADMIN'];

    it('cơ quan thu phí và quản trị được xác nhận, trả bước phí theo luồng nhập', () => {
      const declaration = makeDeclaration({ type: DeclarationType.IMPORT });
      expect(service.assertCanConfirmFee(declaration, FEE_COLLECTOR)).toBe(WorkflowStepCode.IMPORT_FEE);
      expect(service.assertCanConfirmFee(declaration, SYS_ADMIN)).toBe(WorkflowStepCode.IMPORT_FEE);
    });

    it('vai trò không phải thu phí/quản trị bị từ chối', () => {
      const declaration = makeDeclaration({ type: DeclarationType.IMPORT });
      for (const roles of [['CUSTOMS'], ['ENTERPRISE'], ['BORDER_GUARD'], []]) {
        expect(() => service.assertCanConfirmFee(declaration, roles)).toThrow(ForbiddenException);
      }
      expect(() => service.assertCanConfirmFee(declaration, ['CUSTOMS'])).toThrow(
        'Vai trò hiện tại không được phép thực hiện tác vụ phí này.',
      );
    });

    it('phí luồng xuất trả về bước EXPORT_FEE', () => {
      const declaration = makeDeclaration({ type: DeclarationType.EXPORT });
      expect(service.assertCanConfirmFee(declaration, FEE_COLLECTOR)).toBe(WorkflowStepCode.EXPORT_FEE);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. evaluateGate — quy tắc mở cổng, đọc từ PHIÊN XỬ LÝ liên ngành thật
  // ---------------------------------------------------------------------------
  describe('evaluateGate', () => {
    // Tên bước + lực lượng đúng danh mục `workflow-step.catalog`, đã sắp theo thứ tự lộ trình
    // (không tính bước khai báo doanh nghiệp và bước cổng).
    // Bước cổng vào (Biên phòng xác nhận xe vào tại Barrie) đã thành BƯỚC CỔNG (CR7) — do sự kiện
    // cổng khép nên KHÔNG nằm trong danh sách "bước liên ngành phải hoàn thành trước cổng ra".
    const EXPORT_STEP_NAMES = [
      'Hải quan kiểm tra nghiệp vụ theo chuyên ngành',
      'Kiểm dịch kiểm tra nghiệp vụ theo chuyên ngành',
      'Biên phòng kiểm tra nghiệp vụ theo chuyên ngành',
      'Thu phí (nếu có)',
    ];
    const EXPORT_MISSING = [
      'Chưa hoàn thành bước "Hải quan kiểm tra nghiệp vụ theo chuyên ngành" (Hải quan).',
      'Chưa hoàn thành bước "Kiểm dịch kiểm tra nghiệp vụ theo chuyên ngành" (Kiểm dịch).',
      'Chưa hoàn thành bước "Biên phòng kiểm tra nghiệp vụ theo chuyên ngành" (Biên phòng).',
      'Chưa hoàn thành bước "Thu phí (nếu có)" (Cơ quan thu phí).',
    ];
    const IMPORT_MISSING = [
      'Chưa hoàn thành bước "Biên phòng kiểm tra nghiệp vụ theo chuyên ngành" (Biên phòng).',
      'Chưa hoàn thành bước "Kiểm dịch kiểm tra nghiệp vụ theo chuyên ngành" (Kiểm dịch).',
      'Chưa hoàn thành bước "Hải quan kiểm tra nghiệp vụ theo chuyên ngành" (Hải quan).',
      'Chưa hoàn thành bước "Thu phí (nếu có)" (Cơ quan thu phí).',
    ];

    const exportRoute = makeRoute(DeclarationType.EXPORT);
    const importRoute = makeRoute(DeclarationType.IMPORT);
    const decl = (type: DeclarationType, status = DeclarationStatus.PROCESSING) =>
      makeDeclaration({ type, status });

    /** Phiên đã bị từ chối/kéo về bổ sung tại bước đầu tiên — dùng cho nhánh RED. */
    const haltedInstance = (type: DeclarationType, decision: WorkflowDecision): WorkflowInstance => {
      const route = makeRoute(type);
      const instance = WorkflowInstance.start('decl-001', type, route);
      const first = route.actionableSteps[0];
      instance.applyDecision(
        { stepCode: first.code, decision, actorId: 'u', actorName: 'a', reasonCode: 'TC01', reasonNote: 'lý do' },
        route,
      );
      return instance;
    };

    describe('cổng ra luồng xuất B1_EXPORT_EXIT', () => {
      it('mọi bước liên ngành COMPLETED → GREEN, mở cổng, liệt kê đủ các bước phải đạt', () => {
        const instance = makeApprovedInstance('decl-001', DeclarationType.EXPORT);
        const result = service.buildGateEvaluation(decl(DeclarationType.EXPORT), 'B1_EXPORT_EXIT', instance, exportRoute);
        expect(result.canOpen).toBe(true);
        expect(result.statusColor).toBe('GREEN');
        expect(result.blockingReasons).toEqual([]);
        // Bảo hiểm đã bị bỏ khỏi luồng → không còn là điều kiện mở cổng.
        expect(result.requiredCompletedSteps).toEqual(EXPORT_STEP_NAMES);
      });

      it('chưa có phiên (chưa ai xử lý) → YELLOW, liệt kê đủ mọi bước còn thiếu', () => {
        const result = service.buildGateEvaluation(decl(DeclarationType.EXPORT), 'B1_EXPORT_EXIT', null, exportRoute);
        expect(result.canOpen).toBe(false);
        expect(result.statusColor).toBe('YELLOW');
        expect(result.blockingReasons).toEqual(EXPORT_MISSING);
      });

      it('mới duyệt 2/4 bước → chặn cổng, nêu đúng các bước còn thiếu theo tên', () => {
        const instance = makeApprovedInstance('decl-001', DeclarationType.EXPORT, 2);
        const result = service.buildGateEvaluation(decl(DeclarationType.EXPORT), 'B1_EXPORT_EXIT', instance, exportRoute);
        expect(result.canOpen).toBe(false);
        expect(result.blockingReasons).toEqual(EXPORT_MISSING.slice(2));
      });

      it('phiên bị TỪ CHỐI → RED', () => {
        const instance = haltedInstance(DeclarationType.EXPORT, WorkflowDecision.REJECT);
        const result = service.buildGateEvaluation(decl(DeclarationType.EXPORT), 'B1_EXPORT_EXIT', instance, exportRoute);
        expect(result.statusColor).toBe('RED');
        expect(result.canOpen).toBe(false);
      });

      it('phiên đang CHỜ BỔ SUNG → RED', () => {
        const instance = haltedInstance(DeclarationType.EXPORT, WorkflowDecision.REQUEST_SUPPLEMENT);
        const result = service.buildGateEvaluation(decl(DeclarationType.EXPORT), 'B1_EXPORT_EXIT', instance, exportRoute);
        expect(result.statusColor).toBe('RED');
        expect(result.canOpen).toBe(false);
      });
    });

    describe('cổng ra luồng nhập B2_IMPORT_EXIT', () => {
      it('mọi bước liên ngành COMPLETED → GREEN', () => {
        const instance = makeApprovedInstance('decl-001', DeclarationType.IMPORT);
        const result = service.buildGateEvaluation(decl(DeclarationType.IMPORT), 'B2_IMPORT_EXIT', instance, importRoute);
        expect(result.canOpen).toBe(true);
        expect(result.statusColor).toBe('GREEN');
        expect(result.requiredCompletedSteps).toEqual([
          'Biên phòng kiểm tra nghiệp vụ theo chuyên ngành',
          'Kiểm dịch kiểm tra nghiệp vụ theo chuyên ngành',
          'Hải quan kiểm tra nghiệp vụ theo chuyên ngành',
          'Thu phí (nếu có)',
        ]);
      });

      it('thiếu bước Hải quan (mới duyệt 2/4) → chặn, nêu đúng bước Hải quan và Thu phí', () => {
        const instance = makeApprovedInstance('decl-001', DeclarationType.IMPORT, 2);
        const result = service.buildGateEvaluation(decl(DeclarationType.IMPORT), 'B2_IMPORT_EXIT', instance, importRoute);
        expect(result.canOpen).toBe(false);
        expect(result.blockingReasons).toEqual(IMPORT_MISSING.slice(2));
      });
    });

    describe('cổng vào B2_IN_EXPORT và B1_IMPORT_ENTRY — chỉ kiểm tính hợp lệ hồ sơ', () => {
      const cases: Array<[GateEvaluation['gate'], DeclarationType, string]> = [
        ['B2_IN_EXPORT', DeclarationType.EXPORT, 'Hồ sơ chưa ở trạng thái được tiếp nhận.'],
        ['B1_IMPORT_ENTRY', DeclarationType.IMPORT, 'Hồ sơ nhập cảnh chưa hợp lệ.'],
      ];

      it.each(cases)('%s: hồ sơ SUBMITTED chưa có phiên nào vẫn được vào', (gate, type) => {
        const route = makeRoute(type);
        const result = service.buildGateEvaluation(decl(type, DeclarationStatus.SUBMITTED), gate, null, route);
        expect(result.canOpen).toBe(true);
        expect(result.statusColor).toBe('GREEN');
      });

      it.each(cases)('%s: hồ sơ CANCELLED bị chặn', (gate, type, reason) => {
        const route = makeRoute(type);
        const result = service.buildGateEvaluation(decl(type, DeclarationStatus.CANCELLED), gate, null, route);
        expect(result.canOpen).toBe(false);
        expect(result.blockingReasons).toEqual([reason]);
      });

      it.each(cases)('%s: hồ sơ REJECTED bị chặn', (gate, type, reason) => {
        const route = makeRoute(type);
        const result = service.buildGateEvaluation(decl(type, DeclarationStatus.REJECTED), gate, null, route);
        expect(result.canOpen).toBe(false);
        expect(result.blockingReasons).toEqual([reason]);
      });
    });

    // -------------------------------------------------------------------------
    // F39 — nghĩa vụ tài chính THẬT: cổng ra chỉ mở khi đã XÁC NHẬN thanh toán
    // -------------------------------------------------------------------------
    describe('điều kiện đã xác nhận thanh toán (F39 ↔ F48)', () => {
      const snapshot = (outstanding: number): FeeSettlementSnapshot => ({
        total: 1_500_000,
        confirmed: 1_500_000 - outstanding,
        outstanding,
        settled: outstanding === 0,
        currency: 'VND',
      });

      const ready = () => makeApprovedInstance('decl-001', DeclarationType.EXPORT);

      it('mọi nghiệp vụ đã xong nhưng tiền chưa được xác nhận → CHẶN, nêu rõ còn thiếu bao nhiêu', () => {
        const result = service.buildGateEvaluation(
          decl(DeclarationType.EXPORT),
          'B1_EXPORT_EXIT',
          ready(),
          exportRoute,
          snapshot(500_000),
        );
        expect(result.canOpen).toBe(false);
        expect(result.blockingReasons).toEqual(['Còn 500000 VND phí chưa được xác nhận thanh toán.']);
      });

      it('đã xác nhận thanh toán đủ → cổng mở, có điều kiện tài chính trong danh sách phải đạt', () => {
        const result = service.buildGateEvaluation(
          decl(DeclarationType.EXPORT),
          'B1_EXPORT_EXIT',
          ready(),
          exportRoute,
          snapshot(0),
        );
        expect(result.canOpen).toBe(true);
        expect(result.statusColor).toBe('GREEN');
        expect(result.requiredCompletedSteps).toContain('Đã xác nhận thanh toán phí');
      });

      /**
       * Điều kiện tài chính là phép **VÀ**: tiền đã vào không thay thế được việc lực lượng thu phí
       * đã xử lý xong bước của mình, và ngược lại — cả hai đều phải đạt.
       */
      it('đã thanh toán đủ nhưng bước Thu phí chưa hoàn thành → VẪN CHẶN', () => {
        const instance = makeApprovedInstance('decl-001', DeclarationType.EXPORT, 3); // thiếu bước Thu phí
        const result = service.buildGateEvaluation(
          decl(DeclarationType.EXPORT),
          'B1_EXPORT_EXIT',
          instance,
          exportRoute,
          snapshot(0),
        );
        expect(result.canOpen).toBe(false);
        expect(result.blockingReasons).toEqual([
          'Chưa hoàn thành bước "Thu phí (nếu có)" (Cơ quan thu phí).',
        ]);
      });

      it('không truyền ảnh chụp nghĩa vụ tài chính → không tự thêm điều kiện tài chính', () => {
        const result = service.buildGateEvaluation(decl(DeclarationType.EXPORT), 'B1_EXPORT_EXIT', ready(), exportRoute);
        expect(result.canOpen).toBe(true);
        expect(result.requiredCompletedSteps).not.toContain('Đã xác nhận thanh toán phí');
      });

      it('cổng VÀO không bị chặn bởi nghĩa vụ tài chính', () => {
        const result = service.buildGateEvaluation(
          decl(DeclarationType.EXPORT, DeclarationStatus.SUBMITTED),
          'B2_IN_EXPORT',
          null,
          exportRoute,
          snapshot(1_500_000),
        );
        expect(result.canOpen).toBe(true);
      });
    });

    // -------------------------------------------------------------------------
    // Đường async: evaluateGate tự nạp phiên + lộ trình từ repo
    // -------------------------------------------------------------------------
    describe('evaluateGate() nạp phiên từ kho dữ liệu', () => {
      it('không có phiên trong kho → chặn với đủ các bước còn thiếu', async () => {
        const result = await service.evaluateGate(decl(DeclarationType.EXPORT), 'B1_EXPORT_EXIT');
        expect(result.canOpen).toBe(false);
        expect(result.blockingReasons).toEqual(EXPORT_MISSING);
      });

      it('phiên đã duyệt hết các bước → cổng mở', async () => {
        await instances.save(makeApprovedInstance('decl-001', DeclarationType.EXPORT));
        const result = await service.evaluateGate(decl(DeclarationType.EXPORT), 'B1_EXPORT_EXIT');
        expect(result.canOpen).toBe(true);
        expect(result.statusColor).toBe('GREEN');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Tiện ích
  // ---------------------------------------------------------------------------
  describe('gateForDeclaration', () => {
    it.each([
      [DeclarationType.EXPORT, 'B1_EXPORT_EXIT'],
      [DeclarationType.TRANSSHIPMENT_EXPORT, 'B1_EXPORT_EXIT'],
      [DeclarationType.TRANSSHIPMENT_IMPORT, 'B2_IMPORT_EXIT'],
      [DeclarationType.IMPORT, 'B2_IMPORT_EXIT'],
      [DeclarationType.SELF_PROPELLED, 'B2_IMPORT_EXIT'],
    ])('loại hồ sơ %s → cổng %s', (type, expected) => {
      expect(service.gateForDeclaration(makeDeclaration({ type }))).toBe(expected);
    });
  });

  describe('applyCheckpointForStep', () => {
    it.each([
      [WorkflowStepCode.EXPORT_B2_ENTRY, CheckpointCode.B2],
      [WorkflowStepCode.EXPORT_CUSTOMS, CheckpointCode.YARD],
      [WorkflowStepCode.EXPORT_QUARANTINE, CheckpointCode.YARD],
      [WorkflowStepCode.EXPORT_BORDER, CheckpointCode.B1],
      [WorkflowStepCode.EXPORT_FEE, CheckpointCode.B1],
      [WorkflowStepCode.EXPORT_B1_EXIT, CheckpointCode.B1],
      [WorkflowStepCode.IMPORT_B1_ENTRY, CheckpointCode.B1],
      [WorkflowStepCode.IMPORT_BORDER, CheckpointCode.B1],
      [WorkflowStepCode.IMPORT_QUARANTINE, CheckpointCode.YARD],
      [WorkflowStepCode.IMPORT_CUSTOMS, CheckpointCode.B5],
      [WorkflowStepCode.IMPORT_FEE, CheckpointCode.B2],
      [WorkflowStepCode.IMPORT_B2_EXIT, CheckpointCode.B2],
    ])('bước %s đặt chốt về %s', (step, checkpoint) => {
      const declaration = makeDeclaration({ checkpoint: CheckpointCode.SMART_GATE });
      service.applyCheckpointForStep(declaration, step);
      expect(declaration.checkpoint).toBe(checkpoint);
    });

    it.each([WorkflowStepCode.EXPORT_DECLARED, WorkflowStepCode.IMPORT_DECLARED])(
      'bước %s không có chốt tương ứng nên giữ nguyên chốt hiện tại',
      (step) => {
        const declaration = makeDeclaration({ checkpoint: CheckpointCode.SMART_GATE });
        service.applyCheckpointForStep(declaration, step);
        expect(declaration.checkpoint).toBe(CheckpointCode.SMART_GATE);
      },
    );
  });
});
