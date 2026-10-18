import { FeeTransaction } from '../../domain/fee-transaction.entity';

export const FEE_TRANSACTION_REPOSITORY = Symbol('FEE_TRANSACTION_REPOSITORY');

/**
 * Ném khi mã giao dịch/biên lai đã tồn tại trong cùng hồ sơ — chỉ mục duy nhất có điều kiện ở
 * tầng database bắt được, kể cả khi hai yêu cầu ghi cùng lúc. Use-case đổi thành 409.
 */
export class FeeTransactionReferenceError extends Error {
  constructor(public readonly referenceCode: string) {
    super(`Mã giao dịch ${referenceCode} đã tồn tại trong hồ sơ.`);
    this.name = 'FeeTransactionReferenceError';
  }
}

export interface FeeTransactionRepository {
  findById(id: string): Promise<FeeTransaction | null>;
  findByDossier(dossierId: string): Promise<FeeTransaction[]>;
  /** Ghi giao dịch mới. **Ném `FeeTransactionReferenceError`** khi trùng mã biên lai trong hồ sơ. */
  insert(transaction: FeeTransaction): Promise<FeeTransaction>;
  update(transaction: FeeTransaction): Promise<FeeTransaction>;
  /** Tổng tiền các giao dịch **đã xác nhận** của hồ sơ (F48 → F39). */
  sumConfirmed(dossierId: string): Promise<number>;
}
