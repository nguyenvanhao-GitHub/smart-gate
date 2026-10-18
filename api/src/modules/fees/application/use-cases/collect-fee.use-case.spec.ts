import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { FakeNotificationPublisher } from '../../../../common/notifications/testing/fake-notification-publisher';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import {
  InMemoryDeclarationRepository,
  makeAccess,
  makeDeclaration,
} from '../../../declarations/testing/declaration.fixture';
import { FeeTransaction } from '../../domain/fee-transaction.entity';
import { FeeTransactionMethod, FeeTransactionStatus } from '../../domain/fee.enums';
import {
  FakeFeeActorDirectory,
  FakeFeeStepGate,
  InMemoryFeeChargeRepository,
  InMemoryFeeTransactionRepository,
  makeFeeCharge,
} from '../../testing/fee.fixture';
import { CollectFeeUseCase } from './collect-fee.use-case';

class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];

  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

const cashier = makeAccess({
  userId: 'user-thu-ngan',
  roles: [{ code: 'FEE_OFFICER', name: 'Cán bộ thu phí', dataScope: DataScopeLevel.ALL }],
  permissions: ['fee.view', 'fee.create', 'fee.approve'],
});

/** Hồ sơ có đúng một khoản phí 1.000.000 đồng. `seed` cho phép cắm sẵn giao dịch đã thu trước đó. */
function build(seed: FeeTransaction[] = []) {
  const declarations = new InMemoryDeclarationRepository([makeDeclaration({ id: 'ho-so-1', code: 'IMP-0001' })]);
  const charges = new InMemoryFeeChargeRepository([makeFeeCharge({ id: 'khoan-1', amount: 1_000_000 })]);
  const transactions = new InMemoryFeeTransactionRepository(seed);
  const audit = new RecordingAudit();
  const notifications = new FakeNotificationPublisher();
  const scope = new DossierScopeService(new DataScopeService());
  const feeStepGate = new FakeFeeStepGate(true);

  const collect = new CollectFeeUseCase(
    declarations,
    charges,
    transactions,
    new FakeFeeActorDirectory('Nguyễn Thu Ngân'),
    audit,
    notifications,
    feeStepGate,
    scope,
  );
  return { collect, transactions, audit, notifications, feeStepGate };
}

const collectCommand = {
  dossierId: 'ho-so-1',
  amount: 1_000_000,
  method: FeeTransactionMethod.TRANSFER,
  referenceCode: 'BIENLAI-001',
  actorId: cashier.userId,
  access: cashier,
};

describe('Thu phí một nhịp nguyên tử (F47 + F48 gộp)', () => {
  it('tạo đúng MỘT giao dịch CONFIRMED trong một lần lưu, không có trạng thái trung gian', async () => {
    const { collect, transactions } = build();

    const { transaction } = await collect.execute(collectCommand);

    expect(transaction.status).toBe(FeeTransactionStatus.CONFIRMED);
    expect(transaction.confirmedByName).toBe('Nguyễn Thu Ngân');
    const rows = await transactions.findByDossier('ho-so-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe(FeeTransactionStatus.CONFIRMED);
    // Mọi giao dịch được ghi đều đã xác nhận — không còn bước PENDING treo.
    expect(rows.every((row) => row.status === FeeTransactionStatus.CONFIRMED)).toBe(true);
  });

  it('ghi đúng MỘT nhật ký kiểm toán và MỘT thông báo (không nhân đôi record + confirm)', async () => {
    const { collect, audit, notifications } = build();

    await collect.execute(collectCommand);

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0].action).toBe('FEE_TRANSACTION_COLLECT');
    expect(notifications.published).toHaveLength(1);
    expect(notifications.published[0]).toMatchObject({ dossierCode: 'IMP-0001' });
  });

  it('hồ sơ CHƯA tới bước thu phí → chặn 400, không tạo giao dịch', async () => {
    const { collect, feeStepGate, transactions } = build();
    feeStepGate.set(false);

    const error = await collect.execute(collectCommand).catch((caught) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ messageKey: 'fee.stepNotReached' });
    expect(await transactions.findByDossier('ho-so-1')).toHaveLength(0);
  });

  it('số tiền ≤ 0 → 400', async () => {
    const { collect } = build();

    const error = await collect.execute({ ...collectCommand, amount: 0 }).catch((caught) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ messageKey: 'fee.transactionAmountInvalid' });
  });

  it('thu vượt số còn phải thu → 400', async () => {
    const { collect } = build();

    const error = await collect.execute({ ...collectCommand, amount: 1_500_000 }).catch((caught) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      messageKey: 'fee.transactionExceedsOutstanding',
    });
  });

  /**
   * Đã thu đủ trước đó (một giao dịch CONFIRMED bằng đúng số phải thu) thì lần thu thêm bị chặn:
   * `assertWithinOutstanding` đối chiếu mọi giao dịch chưa hủy = tổng CONFIRMED, nhất quán settlement.
   */
  it('đã thu đủ trước đó → thu thêm bị chặn 400', async () => {
    const daThu = FeeTransaction.create({
      dossierId: 'ho-so-1',
      amount: 1_000_000,
      method: FeeTransactionMethod.CASH,
      referenceCode: 'DA-THU',
      createdById: cashier.userId,
      confirmedById: cashier.userId,
      confirmedByName: 'Nguyễn Thu Ngân',
    });
    const { collect } = build([daThu]);

    const error = await collect
      .execute({ ...collectCommand, amount: 1_000_000, referenceCode: 'BIENLAI-002' })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      messageKey: 'fee.transactionExceedsOutstanding',
    });
  });

  it('trùng mã biên lai trong cùng hồ sơ → 409', async () => {
    const { collect } = build();
    await collect.execute({ ...collectCommand, amount: 500_000, referenceCode: 'BIENLAI-001' });

    const error = await collect
      .execute({ ...collectCommand, amount: 400_000, referenceCode: 'BIENLAI-001' })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      messageKey: 'fee.transactionDuplicateReference',
      messageParams: { referenceCode: 'BIENLAI-001' },
    });
  });

  it('thu tiền mặt (CASH) nhiều lần không có mã giao dịch -> thành công, không bị coi là trùng mã giao dịch', async () => {
    const { collect, transactions } = build();
    await collect.execute({ ...collectCommand, method: FeeTransactionMethod.CASH, referenceCode: '', amount: 300_000 });
    await collect.execute({ ...collectCommand, method: FeeTransactionMethod.CASH, referenceCode: undefined, amount: 300_000 });

    const rows = await transactions.findByDossier('ho-so-1');
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === FeeTransactionStatus.CONFIRMED)).toBe(true);
  });

  it('khi thu đủ tiền (settled = true) -> tự động gọi completeFeeStepIfSettled để duyệt bước workflow', async () => {
    const { collect, feeStepGate } = build();
    await collect.execute(collectCommand);

    expect(feeStepGate.completedCalls).toHaveLength(1);
    expect(feeStepGate.completedCalls[0]).toEqual({
      dossierId: 'ho-so-1',
      actorId: cashier.userId,
    });
  });
});
