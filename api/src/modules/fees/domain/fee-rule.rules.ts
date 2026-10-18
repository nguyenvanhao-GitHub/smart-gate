import { DeclarationType } from '../../declarations/domain/declaration.enums';
import { FeeRule } from './fee-rule.entity';

/**
 * Chọn **bản biểu phí đang hiệu lực tại một thời điểm** (F46).
 *
 * Đây là chỗ dễ sai nhất của phân hệ phí: lấy "bản mới nhất" là sai, vì bản mới có thể chưa tới
 * ngày hiệu lực (ban hành trước, áp dụng sau) hoặc đã hết hiệu lực. Quy tắc đúng:
 * 1. lọc các bản **đang bật** và có `effectiveFrom ≤ at ≤ effectiveTo` (thiếu `effectiveTo` = vô hạn);
 * 2. lọc theo **loại hồ sơ** áp dụng;
 * 3. mỗi mã khoản phí chỉ giữ **một** bản — bản có `effectiveFrom` muộn nhất trong số còn lại.
 *
 * Ngày để dạng chuỗi `YYYY-MM-DD` nên so sánh từ điển trùng khít với so sánh thời gian; không phải
 * dựng `Date` nên không dính lệch múi giờ.
 */

/** Ngày áp dụng dạng `YYYY-MM-DD` suy từ một mốc thời gian. */
export function applyDateOf(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Ngày liền trước một ngày `YYYY-MM-DD` (theo UTC, không dính lệch múi giờ).
 *
 * Dùng để **đóng bản biểu phí đang chạy** khi thêm bản mới: bản cũ hết hiệu lực vào hôm trước ngày
 * bản mới bắt đầu, nên tại mọi thời điểm chỉ có **một** bản cùng mã đang hiệu lực (F46).
 */
export function previousDay(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - 1);
  return at.toISOString().slice(0, 10);
}

export function isEffectiveAt(rule: FeeRule, at: string): boolean {
  if (!rule.active) return false;
  if (rule.effectiveFrom > at) return false;
  return rule.effectiveTo === null || rule.effectiveTo >= at;
}

const DOSSIER_TYPES = new Set<string>(Object.values(DeclarationType));

export function appliesToDossier(
  rule: FeeRule,
  dossierType?: DeclarationType,
  vehicleType?: string | null,
): boolean {
  if (!rule.appliesTo || rule.appliesTo.length === 0) return true;

  const configuredDossierTypes = rule.appliesTo.filter((code) => DOSSIER_TYPES.has(code));
  const configuredVehicleTypes = rule.appliesTo.filter((code) => !DOSSIER_TYPES.has(code));

  const matchDossier =
    !dossierType ||
    configuredDossierTypes.length === 0 ||
    configuredDossierTypes.includes(dossierType);

  const matchVehicle =
    !vehicleType ||
    configuredVehicleTypes.length === 0 ||
    configuredVehicleTypes.includes(vehicleType);

  return matchDossier && matchVehicle;
}

export function appliesToDossierType(
  rule: FeeRule,
  dossierType?: DeclarationType,
  vehicleType?: string | null,
): boolean {
  return appliesToDossier(rule, dossierType, vehicleType);
}

/**
 * Bộ khoản phí áp dụng cho một hồ sơ tại thời điểm `at`, đã khử trùng mã và sắp theo `sortOrder`.
 * Hai bản cùng mã, cùng ngày hiệu lực là chuyện database đã chặn bằng chỉ mục duy nhất; nếu vẫn
 * xảy ra thì lấy bản có `sortOrder` nhỏ hơn để kết quả ổn định, không phụ thuộc thứ tự đọc.
 */
export function pickEffectiveRules(
  rules: FeeRule[],
  at: string,
  dossierType?: DeclarationType,
  vehicleType?: string | null,
): FeeRule[] {
  const chosen = new Map<string, FeeRule>();

  rules
    .filter((rule) => isEffectiveAt(rule, at) && appliesToDossier(rule, dossierType, vehicleType))
    .forEach((rule) => {
      const current = chosen.get(rule.code);
      if (!current) {
        chosen.set(rule.code, rule);
        return;
      }
      if (rule.effectiveFrom > current.effectiveFrom) chosen.set(rule.code, rule);
      else if (rule.effectiveFrom === current.effectiveFrom && rule.sortOrder < current.sortOrder) {
        chosen.set(rule.code, rule);
      }
    });

  return [...chosen.values()].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code),
  );
}
