import { Inject, Injectable, Logger } from '@nestjs/common';
import { SYSTEM_ACCESS_CONTEXT } from '../../../../common/auth/access-context';
import { DossierFeeCalculator } from '../../../../common/fees/fee-calculator.port';
import { FEE_CHARGE_REPOSITORY, FeeChargeRepository } from '../../application/ports/fee-charge.repository';
import { CalculateDossierFeesUseCase } from '../../application/use-cases/calculate-dossier-fees.use-case';

/**
 * Hiện thực cổng `FEE_CALCULATOR` — **bọc** `CalculateDossierFeesUseCase` để tự tính phí khi hồ sơ
 * tới bước thu phí (quyết định chủ dự án). Đặt ở phân hệ phí, đúng nếp `WorkflowFeeStepGateAdapter`:
 * chiều phụ thuộc mô-đun là `workflow` → `fees`, nên cổng cho `workflow` gọi vào được đặt tại `fees`.
 *
 * **Idempotent**: đọc `fee_charges` trước; hồ sơ đã có khoản phí thì trả về ngay, KHÔNG tính lại
 * (giữ nguyên điều chỉnh/giao dịch đã có). Chỉ tính khi chưa có khoản nào. Chạy dưới ngữ cảnh hệ
 * thống (`SYSTEM_ACCESS_CONTEXT`, phạm vi ALL) vì đây là thao tác nội bộ, không gắn với người dùng.
 */
@Injectable()
export class DossierFeeCalculatorAdapter implements DossierFeeCalculator {
  private readonly logger = new Logger(DossierFeeCalculatorAdapter.name);

  constructor(
    @Inject(FEE_CHARGE_REPOSITORY)
    private readonly charges: FeeChargeRepository,
    private readonly calculate: CalculateDossierFeesUseCase,
  ) {}

  async ensureCalculated(dossierId: string): Promise<void> {
    const existing = await this.charges.findByDossier(dossierId);
    // Đã có bảng phí → tôn trọng điều chỉnh/giao dịch đã có, không đụng lại.
    if (existing.length > 0) return;

    await this.calculate.execute({
      dossierId,
      actorId: SYSTEM_ACCESS_CONTEXT.userId,
      access: SYSTEM_ACCESS_CONTEXT,
    });
    this.logger.log(`Đã tự tính phí cho hồ sơ ${dossierId} khi tới bước thu phí.`);
  }
}
