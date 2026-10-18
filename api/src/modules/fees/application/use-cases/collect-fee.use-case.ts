import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { FEE_STEP_GATE, FeeStepGateQuery } from '../../../../common/fees/fee-step-gate.port';
import { appBadRequest, appConflict, appNotFound } from '../../../../common/i18n';
import {
  NOTIFICATION_PUBLISHER,
  NotificationPublisher,
} from '../../../../common/notifications/notification-publisher.port';
import {
  DECLARATION_REPOSITORY,
  DeclarationRepository,
} from '../../../declarations/application/ports/declaration.repository';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { NotificationType } from '../../../notifications/domain/notification-type.enum';
import { feeTotals } from '../../domain/fee-calculation.rules';
import { FeeTransaction } from '../../domain/fee-transaction.entity';
import { FeeTransactionStatus } from '../../domain/fee.enums';
import { FeeTransactionView, settlementFor, toFeeTransactionView } from '../dto/fee-view.dto';
import { CollectFeeCommand } from '../dto/fee.command';
import { FEE_ACTOR_DIRECTORY, FeeActorDirectory } from '../ports/fee-actor.port';
import { FEE_CHARGE_REPOSITORY, FeeChargeRepository } from '../ports/fee-charge.repository';
import {
  FEE_TRANSACTION_REPOSITORY,
  FeeTransactionReferenceError,
  FeeTransactionRepository,
} from '../ports/fee-transaction.repository';

/**
 * Thu phí **một nhịp nguyên tử** (gộp F47 + F48) — use-case thu phí **duy nhất**, dùng cho cả bàn làm
 * việc thu ngân lẫn màn phí theo hồ sơ.
 *
 * Trước đây có luồng hai bước "ghi nhận (`PENDING`)" rồi "xác nhận (`CONFIRMED`)"; nhưng cấu hình vai
 * trò không tách người thu với người duyệt (FEE_COLLECTOR có cả `fee.create` lẫn `fee.approve`) nên
 * hai bước không tạo kiểm soát gì, chỉ để lại giao dịch `PENDING` **treo** làm hồ sơ kẹt. Nay bỏ hẳn
 * `PENDING`: use-case ghi **thẳng** một giao dịch đã `CONFIRMED` trong **một** lần lưu (một `INSERT`)
 * — không có trạng thái trung gian nào để treo, nên nguyên tử theo bản chất. Thu = duyệt tiền nên
 * yêu cầu quyền `fee.approve`.
 */
@Injectable()
export class CollectFeeUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    @Inject(FEE_CHARGE_REPOSITORY)
    private readonly charges: FeeChargeRepository,
    @Inject(FEE_TRANSACTION_REPOSITORY)
    private readonly transactions: FeeTransactionRepository,
    @Inject(FEE_ACTOR_DIRECTORY)
    private readonly actors: FeeActorDirectory,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
    @Inject(NOTIFICATION_PUBLISHER)
    private readonly notifications: NotificationPublisher,
    @Inject(FEE_STEP_GATE)
    private readonly feeStepGate: FeeStepGateQuery,
    private readonly scope: DossierScopeService,
  ) {}

  async execute(command: CollectFeeCommand): Promise<{ transaction: FeeTransactionView }> {
    const declaration = await this.declarations.findById(command.dossierId);
    if (!declaration) throw appNotFound('fee.dossierNotFound');
    this.scope.assertAccessible(declaration, command.access);

    // Quyết định chủ dự án: chỉ được thu phí khi hồ sơ đã đi tới bước thu phí trong quy trình.
    if (!(await this.feeStepGate.hasReachedFeeStep(declaration.id))) {
      throw appBadRequest('fee.stepNotReached');
    }

    const amount = Math.round(command.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw appBadRequest('fee.transactionAmountInvalid');
    await this.assertWithinOutstanding(declaration.id, amount);

    const note = command.note?.trim() || null;
    const actor = await this.actors.findById(command.actorId);
    // Ghi thẳng một giao dịch đã CONFIRMED bằng đúng một INSERT — người thu là người xác nhận, không
    // đi qua PENDING nên không có trạng thái trung gian để treo.
    const transaction = FeeTransaction.create({
      dossierId: declaration.id,
      amount,
      method: command.method,
      referenceCode: (command.referenceCode ?? '').trim(),
      attachmentId: command.attachmentId ?? null,
      note,
      createdById: command.actorId,
      confirmedById: command.actorId,
      confirmedByName: actor?.fullName ?? null,
    });

    const saved = await this.insert(transaction);
    const [charges, all] = await Promise.all([
      this.charges.findByDossier(declaration.id),
      this.transactions.findByDossier(declaration.id),
    ]);
    const settlement = settlementFor(charges, all);

    // Một nhịp thu = **một** sự kiện kiểm toán và **một** thông báo (không nhân đôi record + confirm).
    await this.audit.record({
      action: 'FEE_TRANSACTION_COLLECT',
      targetType: 'DECLARATION',
      targetId: declaration.id,
      after: {
        code: declaration.code,
        dossierCode: declaration.code,
        transactionId: saved.id,
        amount: saved.amount,
        method: saved.method,
        referenceCode: saved.referenceCode,
        status: saved.status,
        outstanding: settlement.outstanding,
        settled: settlement.settled,
      },
    });
    await this.notifications.publish({
      type: NotificationType.DOSSIER_STATUS_CHANGED,
      titleKey: settlement.settled
        ? 'notification.feeSettledTitle'
        : 'notification.feePartialTitle',
      titleParams: { code: declaration.code },
      contentKey: settlement.settled
        ? 'notification.feeSettledContent'
        : 'notification.feePartialContent',
      contentParams: settlement.settled
        ? { code: declaration.code, total: settlement.total, currency: settlement.currency }
        : { code: declaration.code, outstanding: settlement.outstanding, currency: settlement.currency },
      dossierId: declaration.id,
      dossierCode: declaration.code,
      ownerUserId: declaration.createdById,
      enterpriseTaxCode: declaration.enterprise.taxCode,
    });

    if (settlement.settled) {
      await this.feeStepGate.completeFeeStepIfSettled?.(declaration.id, command.actorId);
    }

    return { transaction: toFeeTransactionView(saved) };
  }

  /**
   * Không thu quá số phải thu: đối chiếu với **tổng các giao dịch chưa hủy** = tổng `CONFIRMED` (nay
   * không còn `PENDING`), nên trần này **nhất quán** với số "còn phải thu" mà settlement tính — không
   * lệch giữa guard và màn hình. Hồ sơ chưa tính phí (`total = 0`) thì bỏ qua — chưa có nghĩa vụ nên
   * không có trần để so.
   */
  private async assertWithinOutstanding(dossierId: string, amount: number): Promise<void> {
    const [charges, transactions] = await Promise.all([
      this.charges.findByDossier(dossierId),
      this.transactions.findByDossier(dossierId),
    ]);
    const total = feeTotals(charges).total;
    if (total <= 0) return;

    const recorded = transactions
      .filter((item) => item.status !== FeeTransactionStatus.CANCELLED)
      .reduce((sum, item) => sum + item.amount, 0);
    const outstanding = Math.max(0, total - recorded);
    if (amount > outstanding) {
      throw appBadRequest('fee.transactionExceedsOutstanding', { amount, outstanding });
    }
  }

  /** Trùng mã biên lai trong cùng hồ sơ do chỉ mục duy nhất của database bắt → 409. */
  private async insert(transaction: FeeTransaction): Promise<FeeTransaction> {
    try {
      return await this.transactions.insert(transaction);
    } catch (error) {
      if (error instanceof FeeTransactionReferenceError) {
        throw appConflict('fee.transactionDuplicateReference', { referenceCode: error.referenceCode });
      }
      throw error;
    }
  }
}
