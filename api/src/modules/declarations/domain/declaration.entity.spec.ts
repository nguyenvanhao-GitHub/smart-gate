
import { makeDeclaration } from '../testing/declaration.fixture';
import {
  CheckpointCode,
  DeclarationAction,
  DeclarationStatus,
  ForceStatus,
  WorkflowStepCode,
} from './declaration.enums';

const ACTOR = 'user-01';

describe('Declaration (domain entity)', () => {
  // ---------------------------------------------------------------------------
  describe('markWorkflowStepCompleted', () => {
    it('đánh dấu bước workflow hoàn thành và ghi vết OPERATION_ACTION', () => {
      const declaration = makeDeclaration({ status: DeclarationStatus.PROCESSING });

      declaration.markWorkflowStepCompleted(
        WorkflowStepCode.IMPORT_B1_ENTRY,
        ACTOR,
        'BORDER_GUARD',
        'Xe đã vào B1',
      );

      expect(declaration.workflowProgress[WorkflowStepCode.IMPORT_B1_ENTRY]).toBe(
        ForceStatus.COMPLETED,
      );
      expect(declaration.auditTrail[0]).toMatchObject({
        action: DeclarationAction.OPERATION_ACTION,
        note: 'Xe đã vào B1',
        fromStatus: DeclarationStatus.PROCESSING,
        toStatus: DeclarationStatus.PROCESSING,
      });
    });

    it('không truyền ghi chú thì tự sinh ghi chú mặc định theo mã bước', () => {
      const declaration = makeDeclaration();
      declaration.markWorkflowStepCompleted(
        WorkflowStepCode.EXPORT_CUSTOMS,
        ACTOR,
        'CUSTOMS',
      );
      expect(declaration.auditTrail[0].note).toBe('EXPORT_CUSTOMS completed');
    });

    it('KHÔNG làm thay đổi trạng thái hồ sơ, chỉ đánh dấu bước workflow', () => {
      const declaration = makeDeclaration({ status: DeclarationStatus.SUBMITTED });

      declaration.markWorkflowStepCompleted(
        WorkflowStepCode.IMPORT_QUARANTINE,
        ACTOR,
        'QUARANTINE',
      );

      expect(declaration.status).toBe(DeclarationStatus.SUBMITTED);
      expect(declaration.workflowProgress[WorkflowStepCode.IMPORT_QUARANTINE]).toBe(ForceStatus.COMPLETED);
    });

    it('tích luỹ nhiều bước theo đúng thứ tự luồng nhập', () => {
      const declaration = makeDeclaration();
      const cacBuoc = [
        WorkflowStepCode.IMPORT_B1_ENTRY,
        WorkflowStepCode.IMPORT_QUARANTINE,
        WorkflowStepCode.IMPORT_CUSTOMS,
        WorkflowStepCode.IMPORT_FEE,
        WorkflowStepCode.IMPORT_B2_EXIT,
      ];

      cacBuoc.forEach((step) =>
        declaration.markWorkflowStepCompleted(step, ACTOR, 'DISPATCHER'),
      );

      expect(Object.keys(declaration.workflowProgress)).toEqual(cacBuoc);
      expect(declaration.auditTrail).toHaveLength(cacBuoc.length);
    });

    it('đánh dấu lại cùng một bước không tạo trạng thái lạ, chỉ ghi thêm vết', () => {
      const declaration = makeDeclaration();
      declaration.markWorkflowStepCompleted(WorkflowStepCode.IMPORT_BORDER, ACTOR, 'DISPATCHER');
      declaration.markWorkflowStepCompleted(WorkflowStepCode.IMPORT_BORDER, ACTOR, 'DISPATCHER');
      expect(declaration.workflowProgress[WorkflowStepCode.IMPORT_BORDER]).toBe(
        ForceStatus.COMPLETED,
      );
      expect(declaration.auditTrail).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  describe('requestRevision', () => {
    it('chuyển hồ sơ sang REVISION_REQUIRED và ghi lý do', () => {
      const declaration = makeDeclaration({ status: DeclarationStatus.PROCESSING });

      declaration.requestRevision(ACTOR, 'CUSTOMS', 'Thiếu vận đơn');

      expect(declaration.status).toBe(DeclarationStatus.REVISION_REQUIRED);
      expect(declaration.auditTrail[0]).toMatchObject({
        action: DeclarationAction.REQUEST_REVISION,
        note: 'Thiếu vận đơn',
        fromStatus: DeclarationStatus.PROCESSING,
        toStatus: DeclarationStatus.REVISION_REQUIRED,
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('cancel', () => {
    it('chuyển hồ sơ sang CANCELLED và ghi vết', () => {
      const declaration = makeDeclaration({ status: DeclarationStatus.SUBMITTED });

      declaration.cancel(ACTOR, 'ENTERPRISE', 'Doanh nghiệp huỷ chuyến');

      expect(declaration.status).toBe(DeclarationStatus.CANCELLED);
      expect(declaration.auditTrail[0]).toMatchObject({
        action: DeclarationAction.CANCEL,
        fromStatus: DeclarationStatus.SUBMITTED,
        toStatus: DeclarationStatus.CANCELLED,
      });
    });

    it('cho phép huỷ không kèm ghi chú', () => {
      const declaration = makeDeclaration();
      declaration.cancel(ACTOR, 'SYS_ADMIN');
      expect(declaration.auditTrail[0].note).toBeUndefined();
    });

    /**
     * LỖI SẢN PHẨM ĐANG TỒN TẠI (xem báo cáo): không có ràng buộc chuyển trạng thái,
     * hồ sơ đã COMPLETED vẫn huỷ được.
     */
    it('[HÀNH VI HIỆN TẠI - NGHI NGỜ LỖI] hồ sơ đã COMPLETED vẫn huỷ được', () => {
      const declaration = makeDeclaration({ status: DeclarationStatus.COMPLETED });
      declaration.cancel(ACTOR, 'ENTERPRISE');
      expect(declaration.status).toBe(DeclarationStatus.CANCELLED);
    });
  });

  // ---------------------------------------------------------------------------
  describe('recordOperationAction', () => {
    it('ghi vết tác nghiệp mà không đổi trạng thái', () => {
      const declaration = makeDeclaration({ status: DeclarationStatus.PROCESSING });
      declaration.recordOperationAction(ACTOR, 'DISPATCHER', 'Điều xe vào bãi');
      expect(declaration.status).toBe(DeclarationStatus.PROCESSING);
      expect(declaration.auditTrail[0]).toMatchObject({
        action: DeclarationAction.OPERATION_ACTION,
        fromStatus: DeclarationStatus.PROCESSING,
        toStatus: DeclarationStatus.PROCESSING,
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('recordFeeMerge', () => {
    it('ghi vết gộp phí, giữ nguyên trạng thái', () => {
      const declaration = makeDeclaration({ status: DeclarationStatus.WAITING_FOR_FEE });
      declaration.recordFeeMerge(ACTOR, 'FEE_COLLECTOR', 'Gộp với hồ sơ CK-2026-0002');
      expect(declaration.status).toBe(DeclarationStatus.WAITING_FOR_FEE);
      expect(declaration.auditTrail[0]).toMatchObject({
        action: DeclarationAction.FEE_MERGE,
        note: 'Gộp với hồ sơ CK-2026-0002',
        fromStatus: DeclarationStatus.WAITING_FOR_FEE,
        toStatus: DeclarationStatus.WAITING_FOR_FEE,
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('setVehicles (một xe/hồ sơ — CR8)', () => {
    it('khóa max-1: chỉ giữ xe đầu, bỏ xe thừa, đồng bộ vehicle tóm tắt', () => {
      const declaration = makeDeclaration();

      declaration.setVehicles([{ plateNumber: '29C-000.01' }, { plateNumber: '29C-000.02' }]);

      expect(declaration.vehicles.map((item) => item.plateNumber)).toEqual(['29C-000.01']);
      expect(declaration.vehicle.plateNumber).toBe('29C-000.01');
      expect(declaration.plateNumbers).toEqual(['29C-000.01']);
    });

    it('danh sách rỗng → vehicle tóm tắt trống, không còn biển nào giữ chỗ', () => {
      const declaration = makeDeclaration();

      declaration.setVehicles([]);

      expect(declaration.vehicles).toEqual([]);
      expect(declaration.vehicle.plateNumber).toBe('');
      expect(declaration.plateNumbers).toEqual([]);
    });
  });

  describe('setTransshipmentVehicles (CR9)', () => {
    it('thay toàn bộ danh sách phương tiện nhận sang tải', () => {
      const declaration = makeDeclaration();

      declaration.setTransshipmentVehicles([
        { plateNumber: '29T-111.11', driverName: 'Trần Văn B' },
        { plateNumber: '29T-222.22', driverName: 'Lê Văn C' },
      ]);

      expect(declaration.transshipmentVehicles.map((item) => item.plateNumber)).toEqual([
        '29T-111.11',
        '29T-222.22',
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('setCheckpoint', () => {
    it('đổi chốt hiện tại và cập nhật thời điểm sửa, không ghi vết kiểm toán', () => {
      const declaration = makeDeclaration({ checkpoint: CheckpointCode.B1 });
      declaration.setCheckpoint(CheckpointCode.YARD);
      expect(declaration.checkpoint).toBe(CheckpointCode.YARD);
      expect(declaration.auditTrail).toHaveLength(0);
    });
  });
});
