import { NotFoundException } from '@nestjs/common';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { DeclarationType } from '../../../declarations/domain/declaration.enums';
import {
  InMemoryDeclarationRepository,
  makeAccess,
  makeDeclaration,
} from '../../../declarations/testing/declaration.fixture';
import { FeeTransaction } from '../../domain/fee-transaction.entity';
import { FeeTransactionMethod, FeeUnit } from '../../domain/fee.enums';
import {
  FakeFeeStepGate,
  InMemoryFeeChargeRepository,
  InMemoryFeeRuleRepository,
  InMemoryFeeTransactionRepository,
  makeFeeCharge,
  makeFeeRule,
} from '../../testing/fee.fixture';
import { GetDossierFeesUseCase } from './get-dossier-fees.use-case';
import { ListFeeRulesUseCase } from './list-fee-rules.use-case';

const officer = makeAccess({
  userId: 'user-thu-phi',
  roles: [{ code: 'FEE_OFFICER', name: 'Cán bộ thu phí', dataScope: DataScopeLevel.ALL }],
  permissions: ['fee.view'],
});

describe('GetDossierFeesUseCase (F46–F48)', () => {
  function build() {
    const charges = new InMemoryFeeChargeRepository([
      makeFeeCharge({ id: 'k-1', ruleCode: 'INFRA_GATE', amount: 1_000_000, sortOrder: 10 }),
      makeFeeCharge({
        id: 'k-2',
        ruleCode: 'VAT',
        name: 'Thuế giá trị gia tăng',
        unit: FeeUnit.PERCENT,
        unitAmount: 10,
        amount: 100_000,
        sortOrder: 90,
      }),
    ]);
    const transactions = new InMemoryFeeTransactionRepository();
    const feeStepGate = new FakeFeeStepGate(true);
    const useCase = new GetDossierFeesUseCase(
      new InMemoryDeclarationRepository([makeDeclaration({ id: 'ho-so-1' })]),
      charges,
      transactions,
      feeStepGate,
      new DossierScopeService(new DataScopeService()),
    );
    return { useCase, transactions, feeStepGate };
  }

  /** Hợp đồng dữ liệu đã chốt với web — đổi tên trường là phá giao diện thu phí. */
  it('trả đúng hình dạng bảng phí mà web đang dùng', async () => {
    const { useCase } = build();

    const fees = await useCase.execute({ dossierId: 'ho-so-1', access: officer });

    expect(Object.keys(fees).sort()).toEqual(
      ['currency', 'dossierCode', 'feeStepReached', 'items', 'outstanding', 'settled', 'subtotal', 'total', 'transactions', 'vatAmount'].sort(),
    );
    expect(Object.keys(fees.items[0]).sort()).toEqual(
      ['adjusted', 'amount', 'name', 'quantity', 'ruleCode', 'unit', 'unitAmount'].sort(),
    );
    expect(fees).toMatchObject({ subtotal: 1_000_000, vatAmount: 100_000, total: 1_100_000, currency: 'VND' });
  });

  it('chưa thu đồng nào → còn nợ đúng bằng tổng, settled = false', async () => {
    const { useCase } = build();

    const fees = await useCase.execute({ dossierId: 'ho-so-1', access: officer });

    expect(fees).toMatchObject({ outstanding: 1_100_000, settled: false });
    expect(fees.transactions).toEqual([]);
  });

  it('giao dịch trả về đủ trường và giao dịch đã xác nhận trừ hết nợ', async () => {
    const { useCase, transactions } = build();
    const thu = FeeTransaction.create({
      dossierId: 'ho-so-1',
      amount: 1_100_000,
      method: FeeTransactionMethod.CASH,
      referenceCode: 'BIENLAI-001',
      createdById: 'user-thu-phi',
      confirmedById: 'user-thu-phi',
      confirmedByName: 'Người thu phí',
    });
    await transactions.insert(thu);

    const fees = await useCase.execute({ dossierId: 'ho-so-1', access: officer });
    expect(Object.keys(fees.transactions[0]).sort()).toEqual(
      [
        'amount',
        'attachmentId',
        'confirmedAt',
        'confirmedByName',
        'id',
        'method',
        'note',
        'referenceCode',
        'status',
      ].sort(),
    );
    // Thu một nhịp ghi thẳng CONFIRMED nên nghĩa vụ tài chính hoàn thành ngay.
    expect(fees).toMatchObject({ settled: true, outstanding: 0 });
  });

  it('trả cờ feeStepReached theo cổng bước phí (quyết định chủ dự án)', async () => {
    const { useCase, feeStepGate } = build();

    feeStepGate.set(false);
    expect((await useCase.execute({ dossierId: 'ho-so-1', access: officer })).feeStepReached).toBe(false);

    feeStepGate.set(true);
    expect((await useCase.execute({ dossierId: 'ho-so-1', access: officer })).feeStepReached).toBe(true);
  });

  it('hồ sơ không tồn tại → 404', async () => {
    const { useCase } = build();

    await expect(useCase.execute({ dossierId: 'khong-co', access: officer })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ListFeeRulesUseCase (F46)', () => {
  const haTang = makeFeeRule({ code: 'INFRA_GATE', sortOrder: 10 });
  const chiXuat = makeFeeRule({ code: 'EXPORT_ONLY', appliesTo: [DeclarationType.EXPORT], sortOrder: 20 });
  const hetHieuLuc = makeFeeRule({ code: 'OLD', effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31' });

  const useCase = new ListFeeRulesUseCase(new InMemoryFeeRuleRepository([haTang, chiXuat, hetHieuLuc]));

  it('chỉ trả các bản còn hiệu lực tại ngày tra cứu', async () => {
    const rules = await useCase.execute({ at: '2026-03-01' });
    expect(rules.map((rule) => rule.code)).toEqual(['INFRA_GATE', 'EXPORT_ONLY']);
  });

  it('tra ngày cũ thì thấy bản đã đóng', async () => {
    const rules = await useCase.execute({ at: '2025-06-01' });
    expect(rules.map((rule) => rule.code)).toContain('OLD');
  });

  it('lọc theo loại hồ sơ', async () => {
    const rules = await useCase.execute({ at: '2026-03-01', dossierType: DeclarationType.IMPORT });
    expect(rules.map((rule) => rule.code)).toEqual(['INFRA_GATE']);
  });

  it('trả đúng các trường mà danh mục phí của web cần', async () => {
    const [rule] = await useCase.execute({ at: '2026-03-01' });
    expect(Object.keys(rule).sort()).toEqual(
      ['active', 'amount', 'appliesTo', 'code', 'currency', 'effectiveFrom', 'effectiveTo', 'name', 'unit'].sort(),
    );
  });

  it('mã loại hồ sơ lạ được bỏ qua thay vì trả rỗng', async () => {
    const rules = await useCase.execute({ at: '2026-03-01', dossierType: 'KHONG_CO' });
    expect(rules).toHaveLength(2);
  });
});
