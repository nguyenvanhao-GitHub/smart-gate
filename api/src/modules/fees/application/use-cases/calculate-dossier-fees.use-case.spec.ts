import { NotFoundException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { Declaration } from '../../../declarations/domain/declaration.entity';
import { DeclarationType } from '../../../declarations/domain/declaration.enums';
import {
  InMemoryDeclarationRepository,
  makeAccess,
  makeDeclaration,
} from '../../../declarations/testing/declaration.fixture';
import { DispatchAssignment } from '../../../dispatch/domain/dispatch-assignment.entity';
import { InMemoryDispatchAssignmentRepository } from '../../../dispatch/testing/dispatch.fixture';
import { FeeRule } from '../../domain/fee-rule.entity';
import { FeeUnit } from '../../domain/fee.enums';
import {
  FakeFeeStepGate,
  InMemoryFeeChargeRepository,
  InMemoryFeeRuleRepository,
  InMemoryFeeTransactionRepository,
  makeFeeRule,
} from '../../testing/fee.fixture';
import { FeeBasisService } from '../services/fee-basis.service';
import { CalculateDossierFeesUseCase } from './calculate-dossier-fees.use-case';

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

/** Ba bản của cùng khoản phí hạ tầng: đã đóng, đang chạy, và bản tương lai đã ban hành. */
const banCu = makeFeeRule({ id: 'r-cu', amount: 800_000, effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31' });
const banDangChay = makeFeeRule({ id: 'r-nay', amount: 1_000_000, effectiveFrom: '2026-01-01', effectiveTo: null });
const banTuongLai = makeFeeRule({ id: 'r-sau', amount: 1_200_000, effectiveFrom: '2026-09-01', effectiveTo: null });
const vat = makeFeeRule({ id: 'r-vat', code: 'VAT', unit: FeeUnit.PERCENT, amount: 10, sortOrder: 90 });
const luuBai = makeFeeRule({
  id: 'r-bai',
  code: 'YARD_PARKING',
  unit: FeeUnit.DAY,
  amount: 650_000,
  sortOrder: 20,
});

function build(
  ruleSet: FeeRule[] = [banCu, banDangChay, banTuongLai, vat],
  declaration: Declaration = makeDeclaration({ id: 'ho-so-1', type: DeclarationType.IMPORT }),
) {
  const declarations = new InMemoryDeclarationRepository([declaration]);
  const charges = new InMemoryFeeChargeRepository();
  const assignments = new InMemoryDispatchAssignmentRepository();
  const audit = new RecordingAudit();
  const useCase = new CalculateDossierFeesUseCase(
    declarations,
    new InMemoryFeeRuleRepository(ruleSet),
    charges,
    new InMemoryFeeTransactionRepository(),
    audit,
    new FakeFeeStepGate(true),
    new FeeBasisService(assignments),
    new DossierScopeService(new DataScopeService()),
  );
  return { useCase, charges, assignments, audit, declaration };
}

describe('CalculateDossierFeesUseCase (F47)', () => {
  const at = new Date('2026-03-01T08:00:00.000Z');
  const command = { dossierId: 'ho-so-1', actorId: officer.userId, access: officer, at };

  /** ĐIỀU KIỆN NGHIỆM THU: tính theo **bản đang hiệu lực**, không phải bản mới nhất đã ban hành. */
  it('dùng bản biểu phí đang hiệu lực tại ngày áp dụng', async () => {
    const { useCase } = build();

    const { fees } = await useCase.execute(command);

    expect(fees.items.find((item) => item.ruleCode === 'INFRA_GATE')).toMatchObject({
      unitAmount: 1_000_000,
      amount: 1_000_000,
    });
  });

  it('tính lại theo ngày cũ thì ra đúng mức phí đã áp dụng lúc đó', async () => {
    const { useCase } = build();

    const { fees } = await useCase.execute({ ...command, at: new Date('2025-06-01T08:00:00.000Z') });

    expect(fees.items.find((item) => item.ruleCode === 'INFRA_GATE')?.unitAmount).toBe(800_000);
  });

  it('VAT tính trên tổng các khoản còn lại; tổng bảng bằng tổng các dòng', async () => {
    const { useCase } = build();

    const { fees } = await useCase.execute(command);

    expect(fees.subtotal).toBe(1_000_000);
    expect(fees.vatAmount).toBe(100_000);
    expect(fees.total).toBe(1_100_000);
    expect(fees.items.reduce((sum, item) => sum + item.amount, 0)).toBe(fees.total);
    expect(fees.currency).toBe('VND');
  });

  it('số ngày lưu bãi lấy từ vị trí đang giữ trong bãi', async () => {
    const { useCase, assignments } = build([banDangChay, luuBai]);
    await assignments.insert(
      DispatchAssignment.assign({
        dossierId: 'ho-so-1',
        gateCode: null,
        laneCode: null,
        yardId: 'khu-a',
        slotCode: 'A01',
        assignedById: 'user-dieu-phoi',
        note: null,
        at: new Date('2026-02-27T08:00:00.000Z'),
      }),
    );

    const { fees } = await useCase.execute(command);

    // 2026-02-27 → 2026-03-01 là 2 ngày (làm tròn lên).
    expect(fees.items.find((item) => item.ruleCode === 'YARD_PARKING')).toMatchObject({
      quantity: 2,
      amount: 1_300_000,
    });
  });

  it('xe chưa vào bãi thì khoản lưu bãi vẫn hiện với số tiền 0', async () => {
    const { useCase } = build([banDangChay, luuBai]);

    const { fees } = await useCase.execute(command);

    expect(fees.items.find((item) => item.ruleCode === 'YARD_PARKING')).toMatchObject({
      quantity: 0,
      amount: 0,
    });
  });

  /**
   * Điều chỉnh (F47) là quyết định có mã lý do và người chịu trách nhiệm — một lần tính lại
   * **không được** âm thầm ghi đè nó.
   */
  it('tính lại KHÔNG ghi đè dòng đã điều chỉnh, nhưng VAT vẫn bám theo số tiền thực', async () => {
    const { useCase, charges } = build();
    await useCase.execute(command);

    const [haTang] = (await charges.findByDossier('ho-so-1')).filter((item) => item.ruleCode === 'INFRA_GATE');
    haTang.adjust(500_000, 'FEE_ADJ_MISS', 'Miễn giảm theo quyết định.', 'user-thu-phi');
    await charges.save(haTang);

    const { fees } = await useCase.execute(command);

    expect(fees.items.find((item) => item.ruleCode === 'INFRA_GATE')).toMatchObject({
      amount: 500_000,
      adjusted: true,
    });
    expect(fees.vatAmount).toBe(50_000);
    expect(fees.total).toBe(550_000);
  });

  it('giữ nguyên id của dòng chưa điều chỉnh khi tính lại (nhật ký kiểm toán còn trỏ đúng)', async () => {
    const { useCase, charges } = build();
    await useCase.execute(command);
    const truoc = (await charges.findByDossier('ho-so-1')).map((item) => item.id);

    await useCase.execute(command);

    expect((await charges.findByDossier('ho-so-1')).map((item) => item.id)).toEqual(truoc);
  });

  it('khoản không còn trong biểu phí bị loại, trừ khi đã được điều chỉnh', async () => {
    const { useCase, charges } = build([banDangChay, luuBai]);
    await useCase.execute(command);
    const [bai] = (await charges.findByDossier('ho-so-1')).filter((item) => item.ruleCode === 'YARD_PARKING');
    bai.adjust(300_000, 'FEE_ADJ_MISS', null, 'user-thu-phi');
    await charges.save(bai);

    // Biểu phí mới không còn khoản lưu bãi.
    const { useCase: useCaseMoi } = {
      useCase: new CalculateDossierFeesUseCase(
        new InMemoryDeclarationRepository([makeDeclaration({ id: 'ho-so-1' })]),
        new InMemoryFeeRuleRepository([banDangChay]),
        charges,
        new InMemoryFeeTransactionRepository(),
        new RecordingAudit(),
        new FakeFeeStepGate(true),
        new FeeBasisService(new InMemoryDispatchAssignmentRepository()),
        new DossierScopeService(new DataScopeService()),
      ),
    };
    const { fees } = await useCaseMoi.execute(command);

    expect(fees.items.map((item) => item.ruleCode)).toEqual(['INFRA_GATE', 'YARD_PARKING']);
    expect(useCase).toBeDefined();
  });

  it('ghi nhật ký kiểm toán mỗi lần tính phí', async () => {
    const { useCase, audit } = build();

    await useCase.execute(command);

    expect(audit.entries.map((entry) => entry.action)).toContain('FEE_CALCULATE');
  });

  it('hồ sơ không tồn tại → 404', async () => {
    const { useCase } = build();

    await expect(useCase.execute({ ...command, dossierId: 'khong-co' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
