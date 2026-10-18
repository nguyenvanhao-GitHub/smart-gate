import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import { FeeChargeRepository } from '../../application/ports/fee-charge.repository';
import { FeeCharge } from '../../domain/fee-charge.entity';
import { FeeChargeMapper } from './fee-charge.mapper';
import { FeeChargeOrmEntity } from './fee-charge.orm-entity';

@Injectable()
export class TypeOrmFeeChargeRepository implements FeeChargeRepository {
  constructor(
    @InjectRepository(FeeChargeOrmEntity)
    private readonly charges: Repository<FeeChargeOrmEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findByDossier(dossierId: string): Promise<FeeCharge[]> {
    const rows = await this.charges.find({ where: { dossierId }, order: { sortOrder: 'ASC', ruleCode: 'ASC' } });
    return rows.map((row) => FeeChargeMapper.toDomain(row));
  }

  /**
   * Thay nguyên khối bảng phí của hồ sơ **trong một giao dịch**: xóa các dòng không còn nằm trong
   * bộ mới rồi ghi bộ mới. Không xóa sạch rồi ghi lại tất cả, vì như vậy dòng đã điều chỉnh sẽ đổi
   * `id` và mất dấu vết đối chiếu với nhật ký kiểm toán.
   */
  async replaceForDossier(dossierId: string, charges: FeeCharge[]): Promise<FeeCharge[]> {
    await this.dataSource.transaction(async (manager) => {
      const keptIds = charges.map((charge) => charge.id);
      if (keptIds.length === 0) {
        await manager.delete(FeeChargeOrmEntity, { dossierId });
        return;
      }
      await manager.delete(FeeChargeOrmEntity, { dossierId, id: Not(In(keptIds)) });
      await manager.save(charges.map((charge) => FeeChargeMapper.toPersistence(charge)));
    });
    return charges;
  }

  async save(charge: FeeCharge): Promise<FeeCharge> {
    await this.charges.save(FeeChargeMapper.toPersistence(charge));
    return charge;
  }
}
