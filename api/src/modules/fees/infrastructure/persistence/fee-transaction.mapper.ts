import { FeeTransaction } from '../../domain/fee-transaction.entity';
import { FeeTransactionMethod, FeeTransactionStatus } from '../../domain/fee.enums';
import { FeeTransactionOrmEntity } from './fee-transaction.orm-entity';
import { readAmount, writeNumeric } from './money';

export class FeeTransactionMapper {
  static toDomain(row: FeeTransactionOrmEntity): FeeTransaction {
    return new FeeTransaction(
      row.id,
      row.dossierId,
      readAmount(row.amount),
      row.method as FeeTransactionMethod,
      row.referenceCode,
      row.attachmentId,
      row.status as FeeTransactionStatus,
      row.note,
      row.createdById,
      new Date(row.createdAt),
      row.confirmedById,
      row.confirmedByName,
      row.confirmedAt ? new Date(row.confirmedAt) : null,
    );
  }

  static toPersistence(transaction: FeeTransaction): FeeTransactionOrmEntity {
    const row = new FeeTransactionOrmEntity();
    row.id = transaction.id;
    row.dossierId = transaction.dossierId;
    row.amount = writeNumeric(transaction.amount);
    row.method = transaction.method;
    row.referenceCode = transaction.referenceCode;
    row.attachmentId = transaction.attachmentId;
    row.status = transaction.status;
    row.note = transaction.note;
    row.createdById = transaction.createdById;
    row.createdAt = transaction.createdAt;
    row.confirmedById = transaction.confirmedById;
    row.confirmedByName = transaction.confirmedByName;
    row.confirmedAt = transaction.confirmedAt;
    return row;
  }
}
