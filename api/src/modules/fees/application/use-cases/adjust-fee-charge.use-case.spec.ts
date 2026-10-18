import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { AssignmentType } from '../../../access-control/domain/assignment-type.enum';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import {
  InMemoryDeclarationRepository,
  makeAccess,
  makeDeclaration,
} from '../../../declarations/testing/declaration.fixture';
import {
  FakeFeeReasonCatalog,
  FakeFeeStepGate,
  InMemoryFeeChargeRepository,
  InMemoryFeeTransactionRepository,
  makeFeeCharge,
} from '../../testing/fee.fixture';
import { AdjustFeeChargeUseCase } from './adjust-fee-charge.use-case';

class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];

  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

const officer = makeAccess({
  userId: 'user-thu-phi',
  roles: [{ code: 'FEE_OFFICER', name: 'Cán bộ thu phí', dataScope: DataScopeLevel.ALL }],
  permissions: ['fee.view', 'fee.update'],
});

function build(activeReasons: string[] = ['FEE_ADJ_MISS']) {
  const declarations = new InMemoryDeclarationRepository([makeDeclaration({ id: 'ho-so-1' })]);
  const charges = new InMemoryFeeChargeRepository([makeFeeCharge({ id: 'khoan-1' })]);
  const audit = new RecordingAudit();
  const useCase = new AdjustFeeChargeUseCase(
    declarations,
    charges,
    new InMemoryFeeTransactionRepository(),
    new FakeFeeReasonCatalog(activeReasons),
    audit,
    new FakeFeeStepGate(true),
    new DossierScopeService(new DataScopeService()),
  );
  return { useCase, charges, audit };
}

const command = {
  dossierId: 'ho-so-1',
  ruleCode: 'INFRA_GATE',
  amount: 400_000,
  reasonCode: 'FEE_ADJ_MISS',
  reasonNote: 'Miễn giảm theo quyết định 123.',
  actorId: officer.userId,
  access: officer,
};

describe('AdjustFeeChargeUseCase (F47)', () => {
  it('điều chỉnh thành công thì ghi số tiền mới kèm mã lý do và người thực hiện', async () => {
    const { useCase, charges } = build();

    const { fees } = await useCase.execute(command);

    expect(fees.items.find((item) => item.ruleCode === 'INFRA_GATE')).toMatchObject({
      amount: 400_000,
      adjusted: true,
    });
    const [charge] = await charges.findByDossier('ho-so-1');
    expect(charge).toMatchObject({
      reasonCode: 'FEE_ADJ_MISS',
      reasonNote: 'Miễn giảm theo quyết định 123.',
      adjustedById: 'user-thu-phi',
    });
    expect(charge.adjustedAt).toBeInstanceOf(Date);
  });

  /** ĐIỀU KIỆN NGHIỆM THU: **thiếu mã lý do là 400**, không phải bỏ qua rồi vẫn ghi số tiền. */
  it.each([
    ['thiếu hẳn', ''],
    ['chỉ có khoảng trắng', '   '],
  ])('mã lý do %s → 400 và KHÔNG đổi số tiền', async (_ten, reasonCode) => {
    const { useCase, charges } = build();

    const error = await useCase.execute({ ...command, reasonCode }).catch((caught) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      messageKey: 'fee.reasonCodeRequired',
    });
    const [charge] = await charges.findByDossier('ho-so-1');
    expect(charge.amount).toBe(1_000_000);
    expect(charge.adjusted).toBe(false);
  });

  it('mã lý do không thuộc danh mục REASON_FEE_ADJUST (hoặc đã bị khóa) → 400', async () => {
    const { useCase } = build();

    const error = await useCase.execute({ ...command, reasonCode: 'KHONG_CO_TRONG_DANH_MUC' }).catch((c) => c);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      messageKey: 'fee.reasonCodeInvalid',
      messageParams: { reasonCode: 'KHONG_CO_TRONG_DANH_MUC' },
    });
  });

  it('số tiền âm → 400', async () => {
    const { useCase } = build();

    await expect(useCase.execute({ ...command, amount: -1 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('hồ sơ chưa có khoản phí đó → 404 kèm mã khoản phí', async () => {
    const { useCase } = build();

    const error = await useCase.execute({ ...command, ruleCode: 'KHONG_CO' }).catch((caught) => caught);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      messageKey: 'fee.chargeNotFound',
      messageParams: { ruleCode: 'KHONG_CO' },
    });
  });

  it('CHẶN người dùng phạm vi OWN điều chỉnh phí hồ sơ của doanh nghiệp khác', async () => {
    const { useCase } = build();
    const access = makeAccess({
      userId: 'user-dn-khac',
      assignments: [{ type: AssignmentType.TAX_CODE, value: '5599999999' }],
    });

    await expect(useCase.execute({ ...command, access })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ghi nhật ký kiểm toán kèm số tiền trước/sau', async () => {
    const { useCase, audit } = build();

    await useCase.execute(command);

    const entry = audit.entries.find((item) => item.action === 'FEE_ADJUST');
    expect(entry?.before).toMatchObject({ amount: 1_000_000 });
    expect(entry?.after).toMatchObject({ amount: 400_000, reasonCode: 'FEE_ADJ_MISS' });
  });
});
