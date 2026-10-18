import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { appConflict, appNotFound } from '../../../../common/i18n';
import { FeeRule } from '../../domain/fee-rule.entity';
import { applyDateOf } from '../../domain/fee-rule.rules';
import { FeeRuleAdminView, toFeeRuleAdminView } from '../dto/fee-rule-admin.view';
import { UpdateFeeRuleCommand } from '../dto/fee.command';
import { FEE_RULE_REPOSITORY, FeeRuleRepository } from '../ports/fee-rule.repository';

/**
 * Sửa một bản biểu phí (F46) — **có rào versioning ở tầng nghiệp vụ**:
 *
 * - Bản **chưa tới hiệu lực** (`effectiveFrom` > hôm nay): sửa được mọi trường, kể cả mức phí và đơn
 *   vị — nó chưa áp vào hồ sơ nào nên không phá lịch sử.
 * - Bản **đã / đang áp dụng** (`effectiveFrom` ≤ hôm nay): chỉ sửa được **metadata phi-tiền**
 *   (name/description/sortOrder). Đụng vào mức phí / đơn vị / nhóm phí / loại hồ sơ / trạng thái là
 *   **409** — muốn đổi mức thì thêm bản mới để hồ sơ cũ vẫn tra ngược đúng số đã áp dụng.
 *
 * `code` và `effectiveFrom` là khóa của bản nên cố ý **không** cho sửa ở đây.
 */
@Injectable()
export class UpdateFeeRuleUseCase {
  constructor(
    @Inject(FEE_RULE_REPOSITORY)
    private readonly rules: FeeRuleRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: UpdateFeeRuleCommand): Promise<FeeRuleAdminView> {
    const rule = await this.rules.findById(command.id);
    if (!rule) throw appNotFound('fee.ruleNotFound');

    const today = applyDateOf(new Date());
    const applied = rule.effectiveFrom <= today;
    const before = this.snapshot(rule);

    if (applied && this.touchesMoneyFields(rule, command)) {
      throw appConflict('fee.ruleAmountLocked');
    }

    // Metadata phi-tiền — sửa được ở mọi trạng thái.
    if (command.name !== undefined) rule.name = command.name;
    if (command.description !== undefined) rule.description = command.description?.trim() || null;
    if (command.sortOrder !== undefined) rule.sortOrder = command.sortOrder;

    // Trường ảnh hưởng tiền — chỉ cho sửa khi bản chưa tới hiệu lực.
    if (!applied) {
      if (command.amount !== undefined) rule.amount = command.amount;
      if (command.unit !== undefined) rule.unit = command.unit;
      if (command.feeType !== undefined) rule.feeType = command.feeType;
      if (command.appliesTo !== undefined) rule.appliesTo = command.appliesTo;
      if (command.currency !== undefined) rule.currency = command.currency?.trim() || rule.currency;
      if (command.active !== undefined) rule.active = command.active;
    }

    const saved = await this.rules.save(rule);

    await this.audit.record({
      action: 'FEE_RULE_UPDATE',
      targetType: 'FEE_RULE',
      targetId: saved.id,
      before,
      after: this.snapshot(saved),
    });

    return toFeeRuleAdminView(saved, today);
  }

  /**
   * Yêu cầu có **thực sự** đổi một trường ảnh hưởng tiền hay không. Gửi lại đúng giá trị cũ không
   * tính là sửa — tránh chặn oan khi web gửi nguyên bản ghi lên chỉ để đổi mỗi tên.
   */
  private touchesMoneyFields(rule: FeeRule, command: UpdateFeeRuleCommand): boolean {
    if (command.amount !== undefined && command.amount !== rule.amount) return true;
    if (command.unit !== undefined && command.unit !== rule.unit) return true;
    if (command.feeType !== undefined && command.feeType !== rule.feeType) return true;
    if (command.currency !== undefined && command.currency.trim() !== rule.currency) return true;
    if (command.active !== undefined && command.active !== rule.active) return true;
    if (command.appliesTo !== undefined && !this.sameAppliesTo(command.appliesTo, rule.appliesTo)) return true;
    return false;
  }

  private sameAppliesTo(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    const sortedRight = [...right].sort();
    return [...left].sort().every((value, index) => value === sortedRight[index]);
  }

  private snapshot(rule: FeeRule): Record<string, unknown> {
    return {
      code: rule.code,
      name: rule.name,
      amount: rule.amount,
      unit: rule.unit,
      effectiveFrom: rule.effectiveFrom,
      active: rule.active,
    };
  }
}
