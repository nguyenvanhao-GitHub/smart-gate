import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { appConflict } from '../../../../common/i18n';
import { FeeRule } from '../../domain/fee-rule.entity';
import { applyDateOf, previousDay } from '../../domain/fee-rule.rules';
import { FEE_CURRENCY } from '../../domain/fee.enums';
import { FeeRuleAdminView, toFeeRuleAdminView } from '../dto/fee-rule-admin.view';
import { CreateFeeRuleCommand } from '../dto/fee.command';
import { FEE_RULE_REPOSITORY, FeeRuleRepository } from '../ports/fee-rule.repository';

/**
 * Thêm **một bản** biểu phí (F46) theo đúng quy tắc versioning: sửa mức phí **không ghi đè** bản cũ.
 *
 * Khi mã đã có bản đang chạy (`effectiveTo` null):
 * 1. Bản mới phải bắt đầu **sau** bản đang chạy — trùng ngày (409) hoặc sớm hơn (409) đều bị chặn để
 *    lịch sử không chồng lấn.
 * 2. Đóng bản đang chạy bằng `effectiveTo = previousDay(effectiveFrom)` rồi mới thêm bản mới, nên tại
 *    mọi thời điểm chỉ có một bản cùng mã đang hiệu lực và hồ sơ cũ vẫn tra ngược đúng mức đã áp dụng.
 */
@Injectable()
export class CreateFeeRuleUseCase {
  constructor(
    @Inject(FEE_RULE_REPOSITORY)
    private readonly rules: FeeRuleRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: CreateFeeRuleCommand): Promise<FeeRuleAdminView> {
    const effectiveFrom = command.effectiveFrom;
    const all = await this.rules.findAll();
    const sameCode = all.filter((rule) => rule.code === command.code);

    if (sameCode.some((rule) => rule.effectiveFrom === effectiveFrom)) {
      throw appConflict('fee.ruleDuplicateVersion', { code: command.code, effectiveFrom });
    }

    // Chỉ đóng các bản **đang mở** (chưa có ngày kết thúc) bắt đầu trước bản mới.
    const openVersions = sameCode.filter((rule) => rule.effectiveTo === null);
    const tooEarly = openVersions.find((rule) => rule.effectiveFrom >= effectiveFrom);
    if (tooEarly) {
      throw appConflict('fee.ruleEffectiveFromTooEarly', { effectiveFrom, current: tooEarly.effectiveFrom });
    }

    const closingBoundary = previousDay(effectiveFrom);
    for (const open of openVersions) {
      open.effectiveTo = closingBoundary;
      await this.rules.save(open);
    }

    const created = new FeeRule(
      randomUUID(),
      command.code,
      command.name,
      command.feeType,
      command.unit,
      command.amount,
      command.currency?.trim() || FEE_CURRENCY,
      command.appliesTo ?? [],
      effectiveFrom,
      null,
      true,
      command.sortOrder ?? this.nextSortOrder(sameCode, all),
      command.description?.trim() || null,
    );
    const saved = await this.rules.save(created);

    await this.audit.record({
      action: 'FEE_RULE_CREATE',
      targetType: 'FEE_RULE',
      targetId: saved.id,
      after: {
        code: saved.code,
        amount: saved.amount,
        unit: saved.unit,
        effectiveFrom: saved.effectiveFrom,
        closedVersions: openVersions.map((rule) => rule.id),
      },
    });

    return toFeeRuleAdminView(saved, applyDateOf(new Date()));
  }

  /** Giữ nếp `sortOrder` của mã: bản mới thừa hưởng thứ tự của bản cùng mã; mã mới đặt ở cuối bảng (+10 sau max). */
  private nextSortOrder(sameCode: FeeRule[], allRules: FeeRule[]): number {
    if (sameCode.length > 0) {
      return sameCode[0].sortOrder;
    }
    if (allRules.length > 0) {
      return Math.max(...allRules.map((rule) => rule.sortOrder)) + 10;
    }
    return 10;
  }
}
