import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { feeRuleVersionStatus } from '../dto/fee-rule-admin.view';
import { previousDay } from '../../domain/fee-rule.rules';
import { FeeType, FeeUnit } from '../../domain/fee.enums';
import { InMemoryFeeRuleRepository, makeFeeRule } from '../../testing/fee.fixture';
import { CreateFeeRuleUseCase } from './create-fee-rule.use-case';
import { UpdateFeeRuleUseCase } from './update-fee-rule.use-case';

class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];
  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

// Ngày mốc cố định để test không phụ thuộc ngày hệ thống: quá khứ = đã áp dụng, tương lai = chưa tới.
const PAST = '2020-01-01';
const FUTURE = '2099-06-01';
const FAR_FUTURE = '2099-12-01';

function baseCreate() {
  return {
    code: 'INFRA_GATE',
    name: 'Phí hạ tầng cửa khẩu',
    feeType: FeeType.INFRASTRUCTURE,
    unit: FeeUnit.TRIP,
    amount: 1_000_000,
    actorId: 'user-bql',
  };
}

/** F46 — quản trị biểu phí: versioning không ghi đè, khóa mức phí bản đã áp dụng. */
describe('Quản trị biểu phí (F46)', () => {
  describe('CreateFeeRuleUseCase', () => {
    function build(rows = [] as ReturnType<typeof makeFeeRule>[]) {
      const rules = new InMemoryFeeRuleRepository(rows);
      const audit = new RecordingAudit();
      return { rules, audit, useCase: new CreateFeeRuleUseCase(rules, audit) };
    }

    it('mã chưa có bản nào → tạo bản đầu tiên đang mở (effectiveTo null)', async () => {
      const { useCase, rules } = build();

      const view = await useCase.execute({ ...baseCreate(), effectiveFrom: PAST });

      expect(view.effectiveTo).toBeNull();
      expect(view.status).toBe('ACTIVE');
      expect(rules.rows).toHaveLength(1);
    });

    it('ĐÓNG bản đang chạy đúng ngày rồi thêm bản mới (versioning không ghi đè)', async () => {
      const running = makeFeeRule({ id: 'ban-cu', code: 'INFRA_GATE', effectiveFrom: PAST, effectiveTo: null, amount: 800_000 });
      const { useCase, rules, audit } = build([running]);

      const view = await useCase.execute({ ...baseCreate(), amount: 1_200_000, effectiveFrom: FUTURE });

      // Bản cũ được đóng vào ngày liền trước ngày bản mới bắt đầu.
      expect(rules.rows.find((rule) => rule.id === 'ban-cu')?.effectiveTo).toBe(previousDay(FUTURE));
      // Bản mới giữ số tiền mới, bản cũ giữ nguyên số cũ (không ghi đè).
      expect(view.amount).toBe(1_200_000);
      expect(rules.rows.find((rule) => rule.id === 'ban-cu')?.amount).toBe(800_000);
      expect(rules.rows).toHaveLength(2);
      expect(audit.entries.at(-1)).toMatchObject({ action: 'FEE_RULE_CREATE' });
    });

    it('CHẶN trùng ngày hiệu lực cùng mã → 409 fee.ruleDuplicateVersion', async () => {
      const existing = makeFeeRule({ code: 'INFRA_GATE', effectiveFrom: PAST });
      const { useCase, rules } = build([existing]);

      await expect(useCase.execute({ ...baseCreate(), effectiveFrom: PAST })).rejects.toBeInstanceOf(
        ConflictException,
      );
      // Không thêm bản mới khi bị chặn.
      expect(rules.rows).toHaveLength(1);
      try {
        await useCase.execute({ ...baseCreate(), effectiveFrom: PAST });
      } catch (thrown) {
        expect((thrown as ConflictException).getResponse()).toMatchObject({
          messageKey: 'fee.ruleDuplicateVersion',
        });
      }
    });

    it('CHẶN ngày hiệu lực không sau bản đang chạy → 409 fee.ruleEffectiveFromTooEarly', async () => {
      // Bản đang mở bắt đầu ở tương lai xa; bản mới lại xin ngày sớm hơn → chồng lấn lịch sử.
      const running = makeFeeRule({ code: 'INFRA_GATE', effectiveFrom: FAR_FUTURE, effectiveTo: null });
      const { useCase } = build([running]);

      await expect(useCase.execute({ ...baseCreate(), effectiveFrom: FUTURE })).rejects.toBeInstanceOf(
        ConflictException,
      );
      try {
        await useCase.execute({ ...baseCreate(), effectiveFrom: FUTURE });
      } catch (thrown) {
        expect((thrown as ConflictException).getResponse()).toMatchObject({
          messageKey: 'fee.ruleEffectiveFromTooEarly',
        });
      }
    });

    it('gán sortOrder ở cuối danh sách (+10) cho khoản phí mới tạo', async () => {
      const existing = makeFeeRule({ code: 'INFRA_GATE', sortOrder: 30 });
      const { useCase, rules } = build([existing]);

      const view = await useCase.execute({
        ...baseCreate(),
        code: 'NEW_FEE',
        effectiveFrom: FUTURE,
      });

      expect(view.code).toBe('NEW_FEE');
      expect(rules.rows.find((r) => r.code === 'NEW_FEE')?.sortOrder).toBe(40);
    });
  });

  describe('UpdateFeeRuleUseCase', () => {
    function build(rows: ReturnType<typeof makeFeeRule>[]) {
      const rules = new InMemoryFeeRuleRepository(rows);
      const audit = new RecordingAudit();
      return { rules, audit, useCase: new UpdateFeeRuleUseCase(rules, audit) };
    }

    it('CHẶN sửa mức phí của bản ĐÃ/ĐANG áp dụng → 409 fee.ruleAmountLocked', async () => {
      const applied = makeFeeRule({ id: 'r1', effectiveFrom: PAST, amount: 1_000_000 });
      const { useCase, rules } = build([applied]);

      await expect(
        useCase.execute({ id: 'r1', amount: 2_000_000, actorId: 'u' }),
      ).rejects.toBeInstanceOf(ConflictException);
      // Số tiền không bị đổi khi bị chặn.
      expect(rules.rows[0].amount).toBe(1_000_000);
      try {
        await useCase.execute({ id: 'r1', amount: 2_000_000, actorId: 'u' });
      } catch (thrown) {
        expect((thrown as ConflictException).getResponse()).toMatchObject({ messageKey: 'fee.ruleAmountLocked' });
      }
    });

    it('CHO PHÉP sửa mọi trường của bản CHƯA tới hiệu lực', async () => {
      const scheduled = makeFeeRule({ id: 'r2', effectiveFrom: FUTURE, amount: 1_000_000 });
      const { useCase, rules } = build([scheduled]);

      const view = await useCase.execute({ id: 'r2', amount: 1_500_000, unit: FeeUnit.DAY, actorId: 'u' });

      expect(view.amount).toBe(1_500_000);
      expect(view.unit).toBe(FeeUnit.DAY);
      expect(rules.rows[0].amount).toBe(1_500_000);
    });

    it('bản đã áp dụng vẫn sửa được metadata phi-tiền (tên/mô tả)', async () => {
      const applied = makeFeeRule({ id: 'r3', effectiveFrom: PAST, name: 'Tên cũ' });
      const { useCase } = build([applied]);

      const view = await useCase.execute({ id: 'r3', name: 'Tên mới', actorId: 'u' });

      expect(view.name).toBe('Tên mới');
    });

    it('gửi lại đúng số tiền cũ trên bản đã áp dụng KHÔNG bị chặn (chỉ đổi tên)', async () => {
      const applied = makeFeeRule({ id: 'r4', effectiveFrom: PAST, amount: 1_000_000, name: 'Cũ' });
      const { useCase } = build([applied]);

      await expect(
        useCase.execute({ id: 'r4', amount: 1_000_000, name: 'Mới', actorId: 'u' }),
      ).resolves.toMatchObject({ name: 'Mới' });
    });

    it('không tìm thấy bản biểu phí → 404 fee.ruleNotFound', async () => {
      const { useCase } = build([]);

      await expect(useCase.execute({ id: 'khong-co', name: 'X', actorId: 'u' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('Hàm phụ trợ versioning', () => {
    it('previousDay lùi một ngày, xử lý đúng biên tháng/năm', () => {
      expect(previousDay('2099-06-01')).toBe('2099-05-31');
      expect(previousDay('2099-01-01')).toBe('2098-12-31');
      expect(previousDay('2099-03-01')).toBe('2099-02-28');
    });

    it('feeRuleVersionStatus phân loại đúng SCHEDULED/ACTIVE/CLOSED', () => {
      const today = '2026-03-01';
      expect(feeRuleVersionStatus(makeFeeRule({ effectiveFrom: '2026-09-01', effectiveTo: null }), today)).toBe(
        'SCHEDULED',
      );
      expect(feeRuleVersionStatus(makeFeeRule({ effectiveFrom: '2026-01-01', effectiveTo: null }), today)).toBe(
        'ACTIVE',
      );
      expect(
        feeRuleVersionStatus(makeFeeRule({ effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31' }), today),
      ).toBe('CLOSED');
      expect(feeRuleVersionStatus(makeFeeRule({ active: false, effectiveFrom: '2026-01-01' }), today)).toBe(
        'CLOSED',
      );
    });
  });
});
