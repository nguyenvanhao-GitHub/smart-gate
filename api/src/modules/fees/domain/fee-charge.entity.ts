import { randomUUID } from 'crypto';
import { FeeLine } from './fee-calculation.rules';
import { FeeUnit } from './fee.enums';

/**
 * Một khoản phí **đã chốt cho một hồ sơ** — bảng `fee_charges`.
 *
 * Vì sao phải lưu chứ không tính lại mỗi lần đọc: biểu phí đổi theo ngày hiệu lực, và cán bộ được
 * điều chỉnh số tiền kèm mã lý do (F47). Nếu chỉ tính động thì con số trên biên lai hôm nay sẽ khác
 * con số của chính hồ sơ đó tuần sau — không đối soát được.
 */
export class FeeCharge {
  constructor(
    public readonly id: string,
    public readonly dossierId: string,
    /** Bản biểu phí đã dùng để tính. Null khi bản đó đã bị xoá khỏi danh mục. */
    public ruleId: string | null,
    public ruleCode: string,
    public name: string,
    public unit: FeeUnit,
    public quantity: number,
    public unitAmount: number,
    public amount: number,
    /** True khi số tiền do cán bộ nhập/điều chỉnh, không phải do biểu phí sinh ra. */
    public adjusted: boolean,
    public reasonCode: string | null,
    public reasonNote: string | null,
    public adjustedById: string | null,
    public adjustedAt: Date | null,
    public calculatedAt: Date,
    public sortOrder: number,
  ) {}

  static fromLine(dossierId: string, line: FeeLine, at: Date = new Date()): FeeCharge {
    return new FeeCharge(
      randomUUID(),
      dossierId,
      line.ruleId,
      line.ruleCode,
      line.name,
      line.unit,
      line.quantity,
      line.unitAmount,
      line.amount,
      false,
      null,
      null,
      null,
      null,
      at,
      line.sortOrder,
    );
  }

  /**
   * Ghi đè số tiền theo quyết định của cán bộ (F47). Mã lý do **bắt buộc** và đã được use-case đối
   * chiếu với danh mục `REASON_FEE_ADJUST` trước khi gọi tới đây.
   */
  adjust(amount: number, reasonCode: string, reasonNote: string | null, actorId: string, at: Date = new Date()): void {
    this.amount = Math.round(amount);
    this.adjusted = true;
    this.reasonCode = reasonCode;
    this.reasonNote = reasonNote;
    this.adjustedById = actorId;
    this.adjustedAt = at;
  }
}
