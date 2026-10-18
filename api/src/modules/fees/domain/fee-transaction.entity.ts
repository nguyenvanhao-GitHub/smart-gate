import { randomUUID } from 'crypto';
import { FeeTransactionMethod, FeeTransactionStatus } from './fee.enums';

/**
 * Một lần thu tiền của hồ sơ — bảng `fee_transactions` (F48).
 *
 * Thu là **một bước nguyên tử**: mỗi lần ghi tạo thẳng một giao dịch đã xác nhận (`CONFIRMED`), người
 * thu cũng là người xác nhận (`confirmedBy*` set ngay lúc tạo). Không còn bước `PENDING` trung gian
 * nên không có giao dịch treo làm kẹt hồ sơ. Chỉ giao dịch đã xác nhận mới được tính vào nghĩa vụ tài
 * chính, và đó chính là điều kiện cổng ra đối chiếu ở F39.
 */
export class FeeTransaction {
  constructor(
    public readonly id: string,
    public readonly dossierId: string,
    /** Số tiền, số nguyên đồng. */
    public amount: number,
    public method: FeeTransactionMethod,
    /** Mã giao dịch/biên lai. Duy nhất trong phạm vi một hồ sơ (trừ giao dịch đã huỷ). */
    public referenceCode: string,
    /** Tệp chứng từ đã tải lên (bảng `attachments`). */
    public attachmentId: string | null,
    public status: FeeTransactionStatus,
    public note: string | null,
    public createdById: string | null,
    public createdAt: Date,
    public confirmedById: string | null,
    public confirmedByName: string | null,
    public confirmedAt: Date | null,
  ) {}

  /**
   * Ghi một lần thu **đã xác nhận** trong một bước. Actor xác nhận (`confirmedById`/`confirmedByName`)
   * chính là người thu, đặt ngay tại thời điểm tạo cùng `confirmedAt`.
   */
  static create(input: {
    dossierId: string;
    amount: number;
    method: FeeTransactionMethod;
    referenceCode: string;
    attachmentId?: string | null;
    note?: string | null;
    createdById: string;
    confirmedById: string;
    confirmedByName?: string | null;
    at?: Date;
  }): FeeTransaction {
    const at = input.at ?? new Date();
    return new FeeTransaction(
      randomUUID(),
      input.dossierId,
      Math.round(input.amount),
      input.method,
      input.referenceCode,
      input.attachmentId ?? null,
      FeeTransactionStatus.CONFIRMED,
      input.note ?? null,
      input.createdById,
      at,
      input.confirmedById,
      input.confirmedByName ?? null,
      at,
    );
  }

  get isConfirmed(): boolean {
    return this.status === FeeTransactionStatus.CONFIRMED;
  }
}
