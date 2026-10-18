import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { readUniqueViolation } from '../../../../common/persistence/unique-violation';
import {
  FeeTransactionReferenceError,
  FeeTransactionRepository,
} from '../../application/ports/fee-transaction.repository';
import { FeeTransaction } from '../../domain/fee-transaction.entity';
import { FeeTransactionStatus } from '../../domain/fee.enums';
import { FeeTransactionMapper } from './fee-transaction.mapper';
import { FeeTransactionOrmEntity } from './fee-transaction.orm-entity';
import { readAmount } from './money';

@Injectable()
export class TypeOrmFeeTransactionRepository implements FeeTransactionRepository {
  constructor(
    @InjectRepository(FeeTransactionOrmEntity)
    private readonly transactions: Repository<FeeTransactionOrmEntity>,
  ) {}

  async findById(id: string): Promise<FeeTransaction | null> {
    const row = await this.transactions.findOne({ where: { id } });
    return row ? FeeTransactionMapper.toDomain(row) : null;
  }

  async findByDossier(dossierId: string): Promise<FeeTransaction[]> {
    const rows = await this.transactions.find({ where: { dossierId }, order: { createdAt: 'ASC' } });
    return rows.map((row) => FeeTransactionMapper.toDomain(row));
  }

  async insert(transaction: FeeTransaction): Promise<FeeTransaction> {
    try {
      await this.transactions.insert(FeeTransactionMapper.toPersistence(transaction));
      return transaction;
    } catch (error) {
      throw this.toConflict(error, transaction) ?? error;
    }
  }

  async update(transaction: FeeTransaction): Promise<FeeTransaction> {
    await this.transactions.save(FeeTransactionMapper.toPersistence(transaction));
    return transaction;
  }

  /**
   * Tổng cộng ở tầng database (`SUM`) chứ không đọc hết bản ghi rồi cộng trong Node: số tiền phải
   * đúng kể cả khi hồ sơ có nhiều lần thu, và phép cộng trên `numeric` không mất chính xác.
   */
  async sumConfirmed(dossierId: string): Promise<number> {
    const row: { total: string | null } | undefined = await this.transactions
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.dossier_id = :dossierId', { dossierId })
      .andWhere('t.status = :status', { status: FeeTransactionStatus.CONFIRMED })
      .getRawOne();
    return readAmount(row?.total);
  }

  /** Trùng mã biên lai trong cùng hồ sơ → lỗi nghiệp vụ mà use-case đổi thành 409. */
  private toConflict(error: unknown, transaction: FeeTransaction): FeeTransactionReferenceError | null {
    const violation = readUniqueViolation(error);
    if (!violation) return null;
    return new FeeTransactionReferenceError(transaction.referenceCode);
  }
}
