import { ForbiddenException } from '@nestjs/common';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { AssignmentType } from '../../../access-control/domain/assignment-type.enum';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { CheckpointCode, DeclarationStatus } from '../../domain/declaration.enums';
import { makeAccess, makeDeclaration } from '../../testing/declaration.fixture';
import { DossierScopeService } from './dossier-scope.service';

/**
 * Trọng tâm: phạm vi `OWN` sau khi tách bảng `enterprises` phải siết theo **doanh nghiệp**.
 * Trước P2 điều kiện là `createdById = tôi` HOẶC `taxCode thuộc danh sách` — phép HOẶC đó cho
 * một tài khoản đã chuyển sang doanh nghiệp khác vẫn xem được hồ sơ cũ mình từng tạo.
 */
describe('DossierScopeService', () => {
  const service = new DossierScopeService(new DataScopeService());

  const dossierOfEnterpriseA = makeDeclaration({
    id: 'decl-a',
    enterprise: { taxCode: '5500111111', name: 'Doanh nghiệp A' },
    createdById: 'user-dn-a',
  });
  const dossierOfEnterpriseB = makeDeclaration({
    id: 'decl-b',
    enterprise: { taxCode: '5500222222', name: 'Doanh nghiệp B' },
    createdById: 'user-dn-b',
  });

  const accessOfEnterpriseA = makeAccess({
    userId: 'user-ke-toan-a',
    assignments: [{ type: AssignmentType.TAX_CODE, value: '5500111111' }],
  });

  describe('tài khoản có gắn doanh nghiệp', () => {
    it('CHO PHÉP hồ sơ của đúng doanh nghiệp mình, kể cả do người khác tạo', () => {
      expect(service.isAccessible(dossierOfEnterpriseA, accessOfEnterpriseA)).toBe(true);
    });

    it('CHẶN hồ sơ của doanh nghiệp khác', () => {
      expect(() => service.assertAccessible(dossierOfEnterpriseB, accessOfEnterpriseA)).toThrow(ForbiddenException);
      expect(() => service.assertAccessible(dossierOfEnterpriseB, accessOfEnterpriseA)).toThrow(
        /không có quyền truy cập hồ sơ này/,
      );
    });

    it('CHẶN cả hồ sơ do chính mình tạo nhưng thuộc doanh nghiệp khác', () => {
      const dossier = makeDeclaration({
        id: 'decl-cu',
        enterprise: { taxCode: '5500222222', name: 'Doanh nghiệp B' },
        createdById: 'user-ke-toan-a',
      });
      expect(service.isAccessible(dossier, accessOfEnterpriseA)).toBe(false);
    });

    it('sinh điều kiện lọc theo danh sách mã số thuế được phân công', () => {
      expect(service.toCriteria(accessOfEnterpriseA)).toEqual({
        unrestricted: false,
        ownerUserId: 'user-ke-toan-a',
        taxCodes: ['5500111111'],
      });
    });
  });

  describe('tài khoản không gắn doanh nghiệp nào (tài xế…)', () => {
    const driverAccess = makeAccess({ userId: 'user-dn-a' });

    it('CHO PHÉP hồ sơ do chính mình tạo', () => {
      expect(service.isAccessible(dossierOfEnterpriseA, driverAccess)).toBe(true);
    });

    it('CHẶN hồ sơ do người khác tạo', () => {
      expect(service.isAccessible(dossierOfEnterpriseB, driverAccess)).toBe(false);
    });

    it('CHẶN hồ sơ không có người tạo — không để lọt vì dữ liệu thiếu', () => {
      const orphan = makeDeclaration({ id: 'decl-orphan', createdById: undefined });
      expect(service.isAccessible(orphan, driverAccess)).toBe(false);
    });
  });

  describe('phạm vi ALL', () => {
    it('không chèn điều kiện nào', () => {
      const admin = makeAccess({
        userId: 'user-admin',
        roles: [{ code: 'SYS_ADMIN', name: 'Quản trị', dataScope: DataScopeLevel.ALL }],
      });
      expect(service.toCriteria(admin)).toEqual({ unrestricted: true });
      expect(service.isAccessible(dossierOfEnterpriseB, admin)).toBe(true);
    });

    it('nhiều vai trò thì lấy phạm vi rộng nhất', () => {
      const mixed = makeAccess({
        userId: 'user-mixed',
        roles: [
          { code: 'ENTERPRISE', name: 'Doanh nghiệp', dataScope: DataScopeLevel.OWN },
          { code: 'DISPATCHER', name: 'Điều phối', dataScope: DataScopeLevel.ALL },
        ],
      });
      expect(service.toCriteria(mixed).unrestricted).toBe(true);
    });
  });

  /**
   * Cán bộ lực lượng (ORGANIZATION/ASSIGNMENT) chỉ thấy hồ sơ đã tới/đã qua bước của lực lượng mình:
   * `reachedStepCodes` = hợp các bước mà vai trò của họ được xử lý. Chiều này đi kèm `unrestricted:
   * true` (không siết theo doanh nghiệp).
   */
  describe('phạm vi theo tiến trình liên ngành (ORGANIZATION/ASSIGNMENT)', () => {
    const customs = makeAccess({
      userId: 'user-hq',
      roles: [{ code: 'CUSTOMS', name: 'Hải quan', dataScope: DataScopeLevel.ASSIGNMENT }],
    });

    it('lực lượng Hải quan → chỉ các bước hải quan kèm excludeDraft', () => {
      expect(service.toCriteria(customs)).toEqual({
        unrestricted: true,
        reachedStepCodes: ['EXPORT_CUSTOMS', 'IMPORT_CUSTOMS'],
        excludeDraft: true,
      });
    });

    it('Cơ quan thu phí (ORGANIZATION) → chỉ các bước thu phí kèm excludeDraft', () => {
      const feeCollector = makeAccess({
        userId: 'user-thuphi',
        roles: [{ code: 'FEE_COLLECTOR', name: 'Thu phí', dataScope: DataScopeLevel.ORGANIZATION }],
      });
      expect(service.toCriteria(feeCollector)).toEqual({
        unrestricted: true,
        reachedStepCodes: ['EXPORT_FEE', 'IMPORT_FEE'],
        excludeDraft: true,
      });
    });

    it('nhiều vai trò lực lượng → hợp các bước của từng vai', () => {
      const multi = makeAccess({
        userId: 'user-lienlucluong',
        roles: [
          { code: 'CUSTOMS', name: 'Hải quan', dataScope: DataScopeLevel.ASSIGNMENT },
          { code: 'BORDER_GUARD', name: 'Biên phòng', dataScope: DataScopeLevel.ASSIGNMENT },
        ],
      });
      const criteria = service.toCriteria(multi);
      const byName = (left: string, right: string): number => left.localeCompare(right);
      expect(criteria.unrestricted).toBe(true);
      expect(criteria.excludeDraft).toBe(true);
      expect([...(criteria.reachedStepCodes ?? [])].sort(byName)).toEqual(
        [
          // Biên phòng nay giữ cả 2 bước cổng ra (CR42 — thay GATE_OFFICER); Hải quan giữ bước hải quan.
          'EXPORT_B1_EXIT',
          'EXPORT_B2_ENTRY',
          'EXPORT_BORDER',
          'EXPORT_CUSTOMS',
          'IMPORT_B1_ENTRY',
          'IMPORT_B2_EXIT',
          'IMPORT_BORDER',
          'IMPORT_CUSTOMS',
        ].sort(byName),
      );
    });

    it('lãnh đạo/BQL (MANAGEMENT) → thấy toàn bộ, không siết theo bước nhưng loại trừ nháp', () => {
      const management = makeAccess({
        userId: 'user-bql',
        roles: [{ code: 'MANAGEMENT', name: 'Ban quản lý', dataScope: DataScopeLevel.ORGANIZATION }],
      });
      expect(service.toCriteria(management)).toEqual({ unrestricted: true, excludeDraft: true });
    });

    it('BQL kiêm thu phí (MANAGEMENT + FEE_COLLECTOR) → lãnh đạo thắng, vẫn loại trừ nháp', () => {
      const bql = makeAccess({
        userId: 'user-banquanly',
        roles: [
          { code: 'FEE_COLLECTOR', name: 'Thu phí', dataScope: DataScopeLevel.ORGANIZATION },
          { code: 'MANAGEMENT', name: 'Ban quản lý', dataScope: DataScopeLevel.ORGANIZATION },
        ],
      });
      expect(service.toCriteria(bql)).toEqual({ unrestricted: true, excludeDraft: true });
    });

    it('vai trò không gắn bước workflow (kho bãi) → siết requireWorkflow và excludeDraft', () => {
      const yard = makeAccess({
        userId: 'user-bai',
        roles: [{ code: 'YARD_MANAGER', name: 'Quản lý bãi', dataScope: DataScopeLevel.ASSIGNMENT }],
      });
      expect(service.toCriteria(yard)).toEqual({ unrestricted: true, excludeDraft: true, requireWorkflow: true });
    });

    it('SG-284: Điều phối viên (DISPATCHER) với phạm vi ORGANIZATION siết requireWorkflow và excludeDraft', () => {
      const dispatcher = makeAccess({
        userId: 'user-dieu-phoi',
        roles: [{ code: 'DISPATCHER', name: 'Điều phối viên', dataScope: DataScopeLevel.ORGANIZATION }],
        assignments: [{ type: AssignmentType.CHECKPOINT, value: CheckpointCode.B1, label: 'Chốt B1' }],
      });
      expect(service.toCriteria(dispatcher)).toEqual({
        unrestricted: true,
        excludeDraft: true,
        requireWorkflow: true,
      });
    });

    it('SG-284: isAccessible CHẶN bản nháp đối với vai trò nội bộ/lực lượng (excludeDraft: true)', () => {
      const draftDossier = makeDeclaration({
        id: 'decl-draft',
        status: DeclarationStatus.DRAFT,
        checkpoint: CheckpointCode.B1,
      });
      const dispatcher = makeAccess({
        userId: 'user-dieu-phoi',
        roles: [{ code: 'DISPATCHER', name: 'Điều phối viên', dataScope: DataScopeLevel.ORGANIZATION }],
      });
      expect(service.isAccessible(draftDossier, dispatcher)).toBe(false);
      expect(() => service.assertAccessible(draftDossier, dispatcher)).toThrow(ForbiddenException);
    });

    it('SG-284: cán bộ Kiểm dịch phân công SMART_GATE vẫn xem được hồ sơ ở bãi YARD (không bị chặn theo chốt)', () => {
      const yardDossier = makeDeclaration({
        id: 'decl-yard',
        status: DeclarationStatus.BUSINESS_PROCESSING,
        checkpoint: CheckpointCode.YARD,
      });
      const kiemdich = makeAccess({
        userId: 'user-kd',
        roles: [{ code: 'QUARANTINE', name: 'Kiểm dịch', dataScope: DataScopeLevel.ORGANIZATION }],
        assignments: [{ type: AssignmentType.CHECKPOINT, value: CheckpointCode.SMART_GATE, label: 'Cổng thông minh' }],
      });
      expect(service.isAccessible(yardDossier, kiemdich)).toBe(true);
    });

    it('SG-284: Lãnh đạo (MANAGEMENT) kèm phân công chốt vẫn thấy toàn bộ hồ sơ đã nộp (không bị siết theo chốt)', () => {
      const anyDossier = makeDeclaration({
        id: 'decl-any',
        status: DeclarationStatus.SUBMITTED,
        checkpoint: CheckpointCode.B2,
      });
      const management = makeAccess({
        userId: 'user-bql',
        roles: [{ code: 'MANAGEMENT', name: 'Ban quản lý', dataScope: DataScopeLevel.ORGANIZATION }],
        assignments: [{ type: AssignmentType.CHECKPOINT, value: CheckpointCode.B1, label: 'Chốt B1' }],
      });
      expect(service.toCriteria(management)).toEqual({ unrestricted: true, excludeDraft: true });
      expect(service.isAccessible(anyDossier, management)).toBe(true);
    });
  });
});
