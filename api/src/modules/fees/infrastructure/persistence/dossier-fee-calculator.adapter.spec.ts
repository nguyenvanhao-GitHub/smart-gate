import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { DeclarationType } from '../../../declarations/domain/declaration.enums';
import { InMemoryDeclarationRepository, makeDeclaration } from '../../../declarations/testing/declaration.fixture';
import { InMemoryDispatchAssignmentRepository } from '../../../dispatch/testing/dispatch.fixture';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { FeeBasisService } from '../../application/services/fee-basis.service';
import { CalculateDossierFeesUseCase } from '../../application/use-cases/calculate-dossier-fees.use-case';
import {
  FakeFeeStepGate,
  InMemoryFeeChargeRepository,
  InMemoryFeeRuleRepository,
  InMemoryFeeTransactionRepository,
  makeFeeCharge,
  makeFeeRule,
} from '../../testing/fee.fixture';
import { DossierFeeCalculatorAdapter } from './dossier-fee-calculator.adapter';

class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];
  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

/**
 * Cổng `FEE_CALCULATOR` bọc `CalculateDossierFeesUseCase` — quyết định chủ dự án: hồ sơ tới bước thu
 * phí thì tự tính. Bộ test khoá **tính idempotent**: chưa có khoản phí thì tính, đã có thì tuyệt đối
 * KHÔNG tính lại (giữ nguyên điều chỉnh/giao dịch đã có).
 */
describe('DossierFeeCalculatorAdapter (FEE_CALCULATOR)', () => {
  const DOSSIER_ID = 'ho-so-1';

  function build(charges = new InMemoryFeeChargeRepository()) {
    const declarations = new InMemoryDeclarationRepository([
      makeDeclaration({ id: DOSSIER_ID, type: DeclarationType.IMPORT }),
    ]);
    const calculate = new CalculateDossierFeesUseCase(
      declarations,
      new InMemoryFeeRuleRepository([makeFeeRule({ amount: 1_000_000 })]),
      charges,
      new InMemoryFeeTransactionRepository(),
      new RecordingAudit(),
      new FakeFeeStepGate(true),
      new FeeBasisService(new InMemoryDispatchAssignmentRepository()),
      new DossierScopeService(new DataScopeService()),
    );
    const spy = jest.spyOn(calculate, 'execute');
    const adapter = new DossierFeeCalculatorAdapter(charges, calculate);
    return { adapter, charges, calculate, spy };
  }

  it('hồ sơ CHƯA có khoản phí → gọi tính phí và sinh bảng phí', async () => {
    const { adapter, charges, spy } = build();

    await adapter.ensureCalculated(DOSSIER_ID);

    expect(spy).toHaveBeenCalledTimes(1);
    expect((await charges.findByDossier(DOSSIER_ID)).length).toBeGreaterThan(0);
  });

  it('hồ sơ ĐÃ có khoản phí → KHÔNG tính lại (giữ nguyên bảng phí)', async () => {
    const existing = makeFeeCharge({ dossierId: DOSSIER_ID, amount: 500_000 });
    const { adapter, charges, spy } = build(new InMemoryFeeChargeRepository([existing]));

    await adapter.ensureCalculated(DOSSIER_ID);

    expect(spy).not.toHaveBeenCalled();
    const rows = await charges.findByDossier(DOSSIER_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(500_000);
  });
});
