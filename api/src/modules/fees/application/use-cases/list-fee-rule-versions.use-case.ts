import { Inject, Injectable } from '@nestjs/common';
import { applyDateOf } from '../../domain/fee-rule.rules';
import { FeeRuleAdminView, toFeeRuleAdminView } from '../dto/fee-rule-admin.view';
import { FEE_RULE_REPOSITORY, FeeRuleRepository } from '../ports/fee-rule.repository';

/**
 * **Mọi bản** biểu phí cho màn Quản trị (F46) — kể cả bản đã đóng và bản chưa tới hiệu lực, kèm `id`
 * để sửa từng bản. Khác `ListFeeRulesUseCase` (chỉ trả bản đang hiệu lực để đối chiếu khi tính phí).
 *
 * Sắp theo `code` rồi `effectiveFrom` **giảm dần** để mỗi nhóm mã hiện bản mới nhất trước — web gộp
 * theo `code` để dựng lịch sử.
 */
@Injectable()
export class ListFeeRuleVersionsUseCase {
  constructor(
    @Inject(FEE_RULE_REPOSITORY)
    private readonly rules: FeeRuleRepository,
  ) {}

  async execute(): Promise<FeeRuleAdminView[]> {
    const today = applyDateOf(new Date());
    const rules = await this.rules.findAll();
    return rules
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.effectiveFrom.localeCompare(right.effectiveFrom) ||
          left.code.localeCompare(right.code),
      )
      .map((rule) => toFeeRuleAdminView(rule, today));
  }
}
