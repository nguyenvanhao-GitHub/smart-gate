import { DeclarationType, WorkflowStepCode } from '../../declarations/domain/declaration.enums';
import { makeRoute } from '../testing/workflow.fixture';
import { WorkflowInstance } from './workflow-instance.entity';
import { QUARANTINE_AGENCY_CODE, WorkflowRoute } from './workflow-route';
import { WorkflowDecision, WorkflowStepStatus } from './workflow.enums';

/**
 * F26 — "Đã trôi qua" của từng bước trên màn Xử lý liên ngành (khối "Tiến trình xử lý theo đơn vị").
 *
 * Bối cảnh CR44: quy trình đổi từ **một con trỏ tuần tự** sang **cụm bước nghiệp vụ song song**. Bộ
 * test này khoá đúng ngữ nghĩa "đồng hồ" của từng bước để không tái diễn lỗi tính từ lúc mở phiên:
 *  - mỗi bước đếm giờ từ **lúc bước đó thực sự bắt đầu** (mở/IN_PROGRESS) tới lúc COMPLETED (đã xong)
 *    hoặc tới hiện tại (đang mở); bước chưa mở thì không tính;
 *  - cụm song song mở cùng lúc thì các bước có chung mốc bắt đầu (hợp lệ); nhánh dịch tễ thì Biên
 *    phòng/Hải quan bắt đầu **muộn hơn** (khi Kiểm dịch xong);
 *  - **bước cổng** chỉ tính thời điểm xác nhận qua cổng, KHÔNG gộp thời gian xe trên đường/chờ tới cổng.
 *
 * Dùng các mốc thời gian **khác nhau** cho từng giai đoạn — chỗ mà các spec cũ (mốc gửi ≡ mốc qua
 * cổng) không soi tới được.
 */
describe('WorkflowInstance — thời gian đã trôi qua theo từng bước (F26 / CR44)', () => {
  const SUBMIT = new Date('2026-08-01T09:00:00.000Z');
  const GATE_IN = new Date('2026-08-03T14:00:00.000Z'); // xe qua cổng vào, 2 ngày 5h sau khi gửi
  const NOW = new Date('2026-08-03T17:00:00.000Z');

  const inspectionStep = (route: WorkflowRoute, agencyCode: string): WorkflowStepCode =>
    route.inspectionSteps.find((step) => step.agencyCode === agencyCode)!.code;

  const approve = (
    instance: WorkflowInstance,
    route: WorkflowRoute,
    stepCode: WorkflowStepCode,
    at: Date,
    epidemic = false,
  ): void =>
    instance.applyDecision(
      { stepCode, decision: WorkflowDecision.APPROVE, actorId: 'u', actorName: 'CB', reasonCode: null, reasonNote: null, at },
      route,
      epidemic,
    );

  describe('Cụm nghiệp vụ song song (không dịch tễ)', () => {
    it('ba bước nghiệp vụ bắt đầu đếm giờ từ lúc XE QUA CỔNG, không phải lúc gửi hồ sơ', () => {
      const route = makeRoute(DeclarationType.IMPORT);
      const instance = WorkflowInstance.start('d1', DeclarationType.IMPORT, route, SUBMIT, 'DN A');
      instance.completeGateStep(route, false, 'gate', 'Cổng vào', GATE_IN);

      for (const code of [WorkflowStepCode.IMPORT_BORDER, WorkflowStepCode.IMPORT_QUARANTINE, WorkflowStepCode.IMPORT_CUSTOMS]) {
        expect(instance.step(code)?.enteredAt).toEqual(GATE_IN);
      }
      // Đang mở → đếm tới hiện tại: 3 giờ từ khi qua cổng, KHÔNG phải > 2 ngày tính từ lúc gửi.
      expect(instance.step(WorkflowStepCode.IMPORT_BORDER)?.elapsedSeconds(NOW)).toBe(3 * 3600);
    });

    it('bước đã COMPLETED đóng băng đồng hồ ở mốc rời bước, không cộng dồn tới hiện tại', () => {
      const route = makeRoute(DeclarationType.IMPORT);
      const instance = WorkflowInstance.start('d1', DeclarationType.IMPORT, route, SUBMIT, 'DN A');
      instance.completeGateStep(route, false, 'gate', 'Cổng vào', GATE_IN);

      const borderDone = new Date('2026-08-03T15:00:00.000Z'); // duyệt sau 1 giờ
      approve(instance, route, WorkflowStepCode.IMPORT_BORDER, borderDone);

      const border = instance.step(WorkflowStepCode.IMPORT_BORDER);
      expect(border?.status).toBe(WorkflowStepStatus.COMPLETED);
      expect(border?.elapsedSeconds(NOW)).toBe(3600); // đóng băng ở 1 giờ dù NOW muộn hơn 2 giờ nữa
    });

    it('bước chưa mở (PENDING) không tính giờ', () => {
      const route = makeRoute(DeclarationType.IMPORT);
      const instance = WorkflowInstance.start('d1', DeclarationType.IMPORT, route, SUBMIT, 'DN A');
      instance.completeGateStep(route, false, 'gate', 'Cổng vào', GATE_IN);
      const fee = instance.step(WorkflowStepCode.IMPORT_FEE);
      expect(fee?.status).toBe(WorkflowStepStatus.PENDING);
      expect(fee?.enteredAt).toBeNull();
      expect(fee?.elapsedSeconds(NOW)).toBe(0);
    });
  });

  describe('Nhánh dịch tễ — Biên phòng/Hải quan bắt đầu MUỘN hơn Kiểm dịch', () => {
    it('Kiểm dịch bắt đầu từ lúc qua cổng; Biên phòng/Hải quan chỉ đếm giờ từ khi Kiểm dịch xong', () => {
      const route = makeRoute(DeclarationType.IMPORT);
      const instance = WorkflowInstance.start('d1', DeclarationType.IMPORT, route, SUBMIT, 'DN A');
      instance.completeGateStep(route, true /* dịch tễ */, 'gate', 'Cổng vào', GATE_IN);

      // Chỉ Kiểm dịch mở ngay; Biên phòng/Hải quan còn PENDING (chưa vào bước).
      const quarantine = inspectionStep(route, QUARANTINE_AGENCY_CODE);
      expect(instance.step(quarantine)?.enteredAt).toEqual(GATE_IN);
      expect(instance.step(WorkflowStepCode.IMPORT_BORDER)?.status).toBe(WorkflowStepStatus.PENDING);
      expect(instance.step(WorkflowStepCode.IMPORT_BORDER)?.enteredAt).toBeNull();

      // Kiểm dịch xong lúc GATE_IN + 2 giờ → mở Biên phòng/Hải quan tại đúng mốc đó.
      const quarantineDone = new Date('2026-08-03T16:00:00.000Z');
      approve(instance, route, quarantine, quarantineDone, true);

      expect(instance.step(quarantine)?.elapsedSeconds(NOW)).toBe(2 * 3600); // Kiểm dịch: 2 giờ
      expect(instance.step(WorkflowStepCode.IMPORT_BORDER)?.enteredAt).toEqual(quarantineDone);
      expect(instance.step(WorkflowStepCode.IMPORT_BORDER)?.elapsedSeconds(NOW)).toBe(3600); // BP: chỉ 1 giờ
      expect(instance.step(WorkflowStepCode.IMPORT_CUSTOMS)?.elapsedSeconds(NOW)).toBe(3600); // HQ: chỉ 1 giờ
    });
  });

  describe('Bước cổng — chỉ tính thời điểm xác nhận qua cổng (không gộp thời gian chờ)', () => {
    it('cổng VÀO: enteredAt = mốc qua cổng (không phải mốc gửi) nên "Đã trôi qua" ≈ 0', () => {
      const route = makeRoute(DeclarationType.IMPORT);
      const instance = WorkflowInstance.start('d1', DeclarationType.IMPORT, route, SUBMIT, 'DN A');
      // Trước khi sửa: enteredAt giữ mốc gửi → elapsed phồng > 2 ngày. Sau khi sửa: = mốc qua cổng.
      instance.completeGateStep(route, false, 'gate', 'Cổng vào', GATE_IN);

      const entry = instance.step(WorkflowStepCode.IMPORT_B1_ENTRY);
      expect(entry?.status).toBe(WorkflowStepStatus.COMPLETED);
      expect(entry?.enteredAt).toEqual(GATE_IN);
      expect(entry?.completedAt).toEqual(GATE_IN);
      expect(entry?.elapsedSeconds(NOW)).toBe(0);
    });

    it('cổng RA: enteredAt = mốc qua cổng ra (không phải lúc xong thu phí) nên "Đã trôi qua" ≈ 0', () => {
      const route = makeRoute(DeclarationType.IMPORT);
      const instance = WorkflowInstance.start('d1', DeclarationType.IMPORT, route, SUBMIT, 'DN A');
      instance.completeGateStep(route, false, 'gate', 'Cổng vào', GATE_IN);

      // Chạy hết cụm nghiệp vụ + thu phí để phiên đứng ở bước cổng ra.
      approve(instance, route, inspectionStep(route, 'BORDER_GUARD'), new Date('2026-08-03T15:00:00.000Z'));
      approve(instance, route, inspectionStep(route, QUARANTINE_AGENCY_CODE), new Date('2026-08-03T15:10:00.000Z'));
      approve(instance, route, inspectionStep(route, 'CUSTOMS'), new Date('2026-08-03T15:20:00.000Z'));
      const feeDone = new Date('2026-08-03T15:30:00.000Z');
      approve(instance, route, WorkflowStepCode.IMPORT_FEE, feeDone);

      // Cổng ra mở khi xong phí; xe thực sự ra muộn hơn nhiều (chờ trong bãi).
      expect(instance.currentStepCode).toBe(WorkflowStepCode.IMPORT_B2_EXIT);
      const gateOut = new Date('2026-08-04T10:00:00.000Z');
      instance.completeGateStep(route, false, 'gate', 'Cổng ra', gateOut);

      const exit = instance.step(WorkflowStepCode.IMPORT_B2_EXIT);
      expect(exit?.enteredAt).toEqual(gateOut);
      expect(exit?.elapsedSeconds(NOW)).toBe(0);
    });
  });

  describe('Tổng thời gian toàn phiên', () => {
    it('totalElapsedSeconds tính từ lúc gửi tới hiện tại, không nhân đôi vì cụm song song', () => {
      const route = makeRoute(DeclarationType.IMPORT);
      const instance = WorkflowInstance.start('d1', DeclarationType.IMPORT, route, SUBMIT, 'DN A');
      instance.completeGateStep(route, false, 'gate', 'Cổng vào', GATE_IN);
      approve(instance, route, WorkflowStepCode.IMPORT_BORDER, new Date('2026-08-03T15:00:00.000Z'));

      // NOW − SUBMIT = 2 ngày 8 giờ = 202800 giây, bất kể có bao nhiêu bước chạy song song.
      const expected = (NOW.getTime() - SUBMIT.getTime()) / 1000;
      expect(instance.totalElapsedSeconds(NOW)).toBe(expected);
    });
  });
});
