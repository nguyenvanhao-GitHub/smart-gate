import { Inject, Injectable } from '@nestjs/common';
import { DeclarationType } from '../../../declarations/domain/declaration.enums';
import { applyDateOf, isEffectiveAt, appliesToDossierType } from '../../domain/fee-rule.rules';
import { FeeRule } from '../../domain/fee-rule.entity';
import { FeeUnit } from '../../domain/fee.enums';
import { ListFeeRulesQuery } from '../dto/fee.command';
import { FEE_RULE_REPOSITORY, FeeRuleRepository } from '../ports/fee-rule.repository';

/** Hợp đồng dữ liệu của `GET /catalog/fee-rules`. */
export interface FeeRuleView {
  code: string;
  name: string;
  unit: FeeUnit;
  amount: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  appliesTo: string[];
  active: boolean;
}

/**
 * Biểu phí đang hiệu lực tại một thời điểm (F46).
 *
 * Khác `pickEffectiveRules` một điểm có chủ đích: ở đây **không khử trùng mã**. Màn danh mục cần
 * thấy đủ các bản còn hiệu lực để đối chiếu lịch sử; việc chọn đúng một bản để tính tiền là việc
 * của use-case tính phí.
 */
@Injectable()
export class ListFeeRulesUseCase {
  constructor(
    @Inject(FEE_RULE_REPOSITORY)
    private readonly rules: FeeRuleRepository,
  ) {}

  async execute(query: ListFeeRulesQuery = {}): Promise<FeeRuleView[]> {
    const at = query.at?.trim() || applyDateOf(new Date());
    const dossierType = this.toDossierType(query.dossierType);

    const rules = await this.rules.findAll();
    return rules
      .filter((rule) => isEffectiveAt(rule, at) && appliesToDossierType(rule, dossierType))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code))
      .map((rule) => this.toView(rule));
  }

  /** Mã loại hồ sơ lạ được coi như "không lọc" — danh mục là dữ liệu tra cứu, không phải thao tác. */
  private toDossierType(value?: string): DeclarationType | undefined {
    if (!value) return undefined;
    return Object.values(DeclarationType).includes(value as DeclarationType)
      ? (value as DeclarationType)
      : undefined;
  }

  private toView(rule: FeeRule): FeeRuleView {
    return {
      code: rule.code,
      name: rule.name,
      unit: rule.unit,
      amount: rule.amount,
      currency: rule.currency,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      appliesTo: rule.appliesTo,
      active: rule.active,
    };
  }
}
