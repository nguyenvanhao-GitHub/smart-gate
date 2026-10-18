import { DeclarationType } from '../../declarations/domain/declaration.enums';
import { FeeRule } from './fee-rule.entity';
import { FeeUnit } from './fee.enums';

/**
 * Tính nghĩa vụ phí của một hồ sơ theo biểu phí (F47).
 *
 * Toàn bộ phép tính là **số học số nguyên đồng**: mỗi dòng được `Math.round` ngay sau khi nhân,
 * nên tổng của bảng luôn bằng tổng các dòng người dùng nhìn thấy — điều kiện để báo cáo đối soát
 * (F51) khớp đến từng đồng. Không dùng số thực để cộng dồn tiền.
 */

/** Dữ liệu của hồ sơ mà biểu phí lấy làm căn cứ tính lượng. */
export interface FeeBasis {
  dossierType: DeclarationType;
  /** Số lượt qua cửa khẩu của hồ sơ. Hiện luôn là 1 lượt/hồ sơ. */
  trips: number;
  /** Số ngày lưu bãi, làm tròn lên; 0 khi xe chưa vào bãi. */
  parkingDays: number;
  /** Khối lượng hàng quy ra tấn, làm tròn lên. */
  weightTons: number;
}

/** Một dòng phí đã tính. `amount` luôn là số nguyên đồng. */
export interface FeeLine {
  ruleId: string | null;
  ruleCode: string;
  name: string;
  unit: FeeUnit;
  quantity: number;
  /** Mức phí của một đơn vị tính (hoặc tỷ lệ %, khi `unit = PERCENT`). */
  unitAmount: number;
  amount: number;
  sortOrder: number;
}

export interface FeeTotals {
  /** Tổng các khoản **không phải phần trăm**. */
  subtotal: number;
  /** Tổng các khoản tính theo phần trăm (VAT). */
  vatAmount: number;
  total: number;
}

/** Số ngày lưu bãi giữa hai mốc, làm tròn lên, tối thiểu 0. */
export function parkingDaysBetween(from: Date | null | undefined, to: Date): number {
  if (!from) return 0;
  const milliseconds = to.getTime() - from.getTime();
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 0;
  return Math.ceil(milliseconds / (24 * 60 * 60 * 1000));
}

/** Khối lượng quy ra tấn, làm tròn lên; hàng dưới 1 tấn vẫn tính 1 tấn. */
export function weightTonsOf(grossWeightKg: number | undefined): number {
  if (!grossWeightKg || grossWeightKg <= 0) return 0;
  return Math.ceil(grossWeightKg / 1000);
}

/** Lượng tính phí ứng với đơn vị tính. Đơn vị `PERCENT` không có lượng riêng nên trả 1. */
export function quantityFor(unit: FeeUnit, basis: FeeBasis): number {
  switch (unit) {
    case FeeUnit.TRIP:
      return Math.max(0, basis.trips);
    case FeeUnit.DAY:
      return Math.max(0, basis.parkingDays);
    case FeeUnit.TON:
      return Math.max(0, basis.weightTons);
    case FeeUnit.PERCENT:
      return 1;
  }
}

/**
 * Dựng các dòng phí từ bộ quy tắc **đã chọn đúng bản hiệu lực**.
 *
 * Dòng `PERCENT` (VAT) luôn tính sau và lấy căn cứ là tổng các dòng còn lại, nên thứ tự trong
 * `rules` không làm đổi kết quả. Dòng có lượng bằng 0 (ví dụ xe chưa vào bãi) vẫn được giữ lại với
 * số tiền 0 để người dùng thấy khoản đó có tồn tại mà chưa phát sinh.
 */
export function calculateFeeLines(rules: FeeRule[], basis: FeeBasis): FeeLine[] {
  const measured = rules
    .filter((rule) => rule.unit !== FeeUnit.PERCENT)
    .map((rule) => {
      const quantity = quantityFor(rule.unit, basis);
      return {
        ruleId: rule.id,
        ruleCode: rule.code,
        name: rule.name,
        unit: rule.unit,
        quantity,
        unitAmount: rule.amount,
        amount: Math.round(rule.amount * quantity),
        sortOrder: rule.sortOrder,
      };
    });

  const base = measured.reduce((acc, line) => acc + line.amount, 0);

  const percentage = rules
    .filter((rule) => rule.unit === FeeUnit.PERCENT)
    .map((rule) => ({
      ruleId: rule.id,
      ruleCode: rule.code,
      name: rule.name,
      unit: rule.unit,
      quantity: 1,
      unitAmount: rule.amount,
      amount: Math.round((base * rule.amount) / 100),
      sortOrder: rule.sortOrder,
    }));

  return [...measured, ...percentage].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.ruleCode.localeCompare(right.ruleCode),
  );
}

/**
 * Cộng bảng phí. Làm việc trên **số tiền đang lưu của từng dòng**, kể cả dòng đã bị cán bộ điều
 * chỉnh — điều chỉnh là quyết định có mã lý do, không được một phép tính lại âm thầm ghi đè.
 */
export function feeTotals(lines: Array<Pick<FeeLine, 'unit' | 'amount'>>): FeeTotals {
  const subtotal = lines
    .filter((line) => line.unit !== FeeUnit.PERCENT)
    .reduce((acc, line) => acc + line.amount, 0);
  const vatAmount = lines
    .filter((line) => line.unit === FeeUnit.PERCENT)
    .reduce((acc, line) => acc + line.amount, 0);
  return { subtotal, vatAmount, total: subtotal + vatAmount };
}
