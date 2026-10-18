import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { FEE_RULE_SEED } from '../../domain/fee-rule.seed';
import { FEE_RULE_REPOSITORY, FeeRuleRepository } from '../ports/fee-rule.repository';

/**
 * Nạp **biểu phí tạm** (điểm D6) khi ứng dụng khởi động, cùng nếp với `CatalogSeedService`.
 *
 * Chỉ thêm bản còn thiếu theo cặp (mã, ngày hiệu lực từ) — quản trị sửa mức phí qua danh mục xong
 * khởi động lại app **không** bị trả về số cũ.
 */
@Injectable()
export class FeeRuleSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FeeRuleSeedService.name);

  constructor(
    @Inject(FEE_RULE_REPOSITORY)
    private readonly rules: FeeRuleRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const added = await this.rules.ensureSeed(FEE_RULE_SEED);
    this.logger.log(`Đã đồng bộ biểu phí tạm: thêm ${added}/${FEE_RULE_SEED.length} khoản.`);
  }
}
