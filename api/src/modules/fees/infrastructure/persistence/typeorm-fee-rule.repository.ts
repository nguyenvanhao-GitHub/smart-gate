import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { FeeRuleRepository } from '../../application/ports/fee-rule.repository';
import { FeeRule } from '../../domain/fee-rule.entity';
import { FeeRuleSeed } from '../../domain/fee-rule.seed';
import { FEE_CURRENCY } from '../../domain/fee.enums';
import { FeeRuleMapper } from './fee-rule.mapper';
import { FeeRuleOrmEntity } from './fee-rule.orm-entity';

@Injectable()
export class TypeOrmFeeRuleRepository implements FeeRuleRepository {
  constructor(
    @InjectRepository(FeeRuleOrmEntity)
    private readonly rules: Repository<FeeRuleOrmEntity>,
  ) {}

  async findAll(): Promise<FeeRule[]> {
    const rows = await this.rules.find({ order: { sortOrder: 'ASC', code: 'ASC', effectiveFrom: 'ASC' } });
    return rows.map((row) => FeeRuleMapper.toDomain(row));
  }

  async findById(id: string): Promise<FeeRule | null> {
    const row = await this.rules.findOne({ where: { id } });
    return row ? FeeRuleMapper.toDomain(row) : null;
  }

  async save(rule: FeeRule): Promise<FeeRule> {
    const saved = await this.rules.save(FeeRuleMapper.toPersistence(rule));
    return FeeRuleMapper.toDomain(saved);
  }

  /**
   * Chỉ thêm bản **còn thiếu theo cặp (mã, ngày hiệu lực từ)**.
   *
   * `ON CONFLICT DO NOTHING` trên đúng chỉ mục duy nhất `uq_fee_rules_code_from` nên chạy lại
   * nhiều lần cho cùng kết quả (idempotent) và không đè lên số tiền quản trị đã sửa tay.
   */
  async ensureSeed(seeds: FeeRuleSeed[]): Promise<number> {
    if (seeds.length === 0) return 0;

    const rows = seeds.map((seed) =>
      FeeRuleMapper.toPersistence(
        new FeeRule(
          randomUUID(),
          seed.code,
          seed.name,
          seed.feeType,
          seed.unit,
          seed.amount,
          FEE_CURRENCY,
          seed.appliesTo,
          seed.effectiveFrom,
          seed.effectiveTo,
          true,
          seed.sortOrder,
          seed.description,
        ),
      ),
    );

    const result = await this.rules
      .createQueryBuilder()
      .insert()
      .into(FeeRuleOrmEntity)
      .values(rows)
      .orIgnore()
      .execute();
    return result.identifiers.filter((item) => !!item).length;
  }
}
