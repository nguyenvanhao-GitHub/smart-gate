import { FeeRule } from '../../domain/fee-rule.entity';
import { applyDateOf } from '../../domain/fee-rule.rules';
import { FeeType, FeeUnit } from '../../domain/fee.enums';

/**
 * Trạng thái vòng đời của **một bản** biểu phí, suy ra từ ngày hiệu lực và cờ `active` — mã ASCII
 * trong tập đóng, nhãn tra qua i18n ở web:
 * - `SCHEDULED` — chưa tới ngày hiệu lực (`effectiveFrom` > hôm nay).
 * - `ACTIVE`    — đang hiệu lực hôm nay.
 * - `CLOSED`    — đã đóng (`effectiveTo` < hôm nay) hoặc bị tắt (`active = false`).
 */
export type FeeRuleVersionStatus = 'SCHEDULED' | 'ACTIVE' | 'CLOSED';

/**
 * Hợp đồng dữ liệu của màn Quản trị biểu phí (F46). Khác `FeeRuleView` của `GET /catalog/fee-rules`
 * ở hai điểm: trả **mọi bản** (kể cả đã đóng / chưa tới) và có `id` để `PATCH` từng bản.
 */
export interface FeeRuleAdminView {
  id: string;
  code: string;
  name: string;
  feeType: FeeType;
  unit: FeeUnit;
  amount: number;
  currency: string;
  appliesTo: string[];
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
  sortOrder: number;
  description: string | null;
  status: FeeRuleVersionStatus;
}

export function feeRuleVersionStatus(rule: FeeRule, today: string): FeeRuleVersionStatus {
  if (!rule.active) return 'CLOSED';
  if (rule.effectiveFrom > today) return 'SCHEDULED';
  if (rule.effectiveTo !== null && rule.effectiveTo < today) return 'CLOSED';
  return 'ACTIVE';
}

export function toFeeRuleAdminView(rule: FeeRule, today = applyDateOf(new Date())): FeeRuleAdminView {
  return {
    id: rule.id,
    code: rule.code,
    name: rule.name,
    feeType: rule.feeType,
    unit: rule.unit,
    amount: rule.amount,
    currency: rule.currency,
    appliesTo: rule.appliesTo,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
    active: rule.active,
    sortOrder: rule.sortOrder,
    description: rule.description,
    status: feeRuleVersionStatus(rule, today),
  };
}
