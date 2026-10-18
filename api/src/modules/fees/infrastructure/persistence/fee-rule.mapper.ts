import { FeeRule } from '../../domain/fee-rule.entity';
import { FeeType, FeeUnit } from '../../domain/fee.enums';
import { FeeRuleOrmEntity } from './fee-rule.orm-entity';
import { readAmount, writeNumeric } from './money';

/** Cột `date` có thể được driver trả về dạng `Date`; biểu phí luôn làm việc với chuỗi `YYYY-MM-DD`. */
function toDateString(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

export class FeeRuleMapper {
  static toDomain(row: FeeRuleOrmEntity): FeeRule {
    return new FeeRule(
      row.id,
      row.code,
      row.name,
      row.feeType as FeeType,
      row.unit as FeeUnit,
      readAmount(row.amount),
      row.currency,
      row.appliesTo ?? [],
      toDateString(row.effectiveFrom) ?? '',
      toDateString(row.effectiveTo),
      row.active,
      row.sortOrder,
      row.description,
    );
  }

  static toPersistence(rule: FeeRule): FeeRuleOrmEntity {
    const row = new FeeRuleOrmEntity();
    row.id = rule.id;
    row.code = rule.code;
    row.name = rule.name;
    row.feeType = rule.feeType;
    row.unit = rule.unit;
    row.amount = writeNumeric(rule.amount);
    row.currency = rule.currency;
    row.appliesTo = rule.appliesTo;
    row.effectiveFrom = rule.effectiveFrom;
    row.effectiveTo = rule.effectiveTo;
    row.active = rule.active;
    row.sortOrder = rule.sortOrder;
    row.description = rule.description;
    return row;
  }
}
