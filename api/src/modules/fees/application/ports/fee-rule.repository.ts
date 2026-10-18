import { FeeRule } from '../../domain/fee-rule.entity';
import { FeeRuleSeed } from '../../domain/fee-rule.seed';

export const FEE_RULE_REPOSITORY = Symbol('FEE_RULE_REPOSITORY');

export interface FeeRuleRepository {
  /**
   * **Mọi bản** của biểu phí, kể cả bản đã hết hiệu lực — việc chọn bản đang hiệu lực là quy tắc
   * nghiệp vụ (`pickEffectiveRules`), không phải điều kiện SQL: hồ sơ cũ phải tra ngược được đúng
   * mức phí đã áp dụng tại ngày của nó.
   */
  findAll(): Promise<FeeRule[]>;
  /** Một bản biểu phí theo id, hoặc `null` nếu không có — phục vụ màn Quản trị biểu phí (F46). */
  findById(id: string): Promise<FeeRule | null>;
  /**
   * Ghi một bản biểu phí (thêm mới hoặc cập nhật theo `id`). Dùng khi quản trị thêm bản mới và
   * **đóng bản đang chạy** — versioning không ghi đè số tiền của bản đã áp dụng (F46).
   */
  save(rule: FeeRule): Promise<FeeRule>;
  /**
   * Thêm các bản seed **còn thiếu theo cặp (mã, ngày hiệu lực từ)**. Không bao giờ ghi đè số tiền
   * đã có trong database — sửa tay xong khởi động lại app không bị trả về số cũ (F46).
   * Trả về số bản đã thêm.
   */
  ensureSeed(seeds: FeeRuleSeed[]): Promise<number>;
}
