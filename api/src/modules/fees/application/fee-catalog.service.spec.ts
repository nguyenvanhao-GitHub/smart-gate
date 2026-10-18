import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditEntryInput, AuditLogger } from '../../../common/audit/audit-logger.port';
import {
  FeeSettlementQuery,
  FeeSettlementSnapshot,
  NO_FEE_OBLIGATION,
} from '../../../common/fees/fee-settlement.port';
import { WorkflowPolicyService } from '../../declarations/application/workflow-policy.service';
import { DeclarationStatus, DeclarationType, ForceStatus } from '../../declarations/domain/declaration.enums';
import { InMemoryDeclarationRepository, makeDeclaration } from '../../declarations/testing/declaration.fixture';
import { WorkflowRouteService } from '../../workflow/application/services/workflow-route.service';
import { FakeStepDirectory, InMemoryWorkflowInstanceRepository } from '../../workflow/testing/workflow.fixture';
import { FakeDossierFeeCalculator, FakeFeeStepGate } from '../testing/fee.fixture';
import { FEE_ACTIONS, FEE_ACTION_EFFECTS, FEE_SCREENS, FEE_SLUGS, FeeSlug } from './fee.catalog';
import { FeeCatalogService } from './fee-catalog.service';
import { SettingsReader } from '../../../common/settings/settings-reader.port';

/** Ảnh chụp nghĩa vụ tài chính theo hồ sơ — giúp gọn khi dựng tình huống thanh toán. */
function snap(total: number, confirmed = 0): FeeSettlementSnapshot {
  const outstanding = Math.max(0, total - confirmed);
  return { total, confirmed, outstanding, settled: outstanding <= 0, currency: 'VND' };
}

/** `FEE_SETTLEMENT` giả lập — trả nghĩa vụ theo từng hồ sơ, mặc định "không có nghĩa vụ". */
class MapFeeSettlement implements FeeSettlementQuery {
  private readonly map = new Map<string, FeeSettlementSnapshot>();
  set(dossierId: string, snapshot: FeeSettlementSnapshot): void {
    this.map.set(dossierId, snapshot);
  }
  async snapshotOf(dossierId: string): Promise<FeeSettlementSnapshot> {
    return this.map.get(dossierId) ?? NO_FEE_OBLIGATION;
  }
}

/**
 * Trước đây loại hành động phí được đoán từ nhãn tiếng Việt (`includes('huy')`, `includes('gộp')`),
 * và slug lạ **âm thầm** rơi về khoản phí Thuế. Bộ test này khoá cả hai chỗ, và (BUG-007/008/009):
 *  - hành động `COLLECT` (thu tiền giả) đã bị gỡ khỏi màn `/fees/:slug`;
 *  - số tiền/trạng thái dòng đọc **thật** từ `settlement` (một nguồn số với màn phí theo hồ sơ);
 *  - mọi thao tác phí ghi vào `audit_logs` (`FEE_WORKBENCH_ACTION`), không chỉ `declaration.auditTrail`.
 */
describe('FeeCatalogService', () => {
  let declarations: InMemoryDeclarationRepository;
  let settlement: MapFeeSettlement;
  let feeStepGate: FakeFeeStepGate;
  let feeCalculator: FakeDossierFeeCalculator;
  let auditRecords: AuditEntryInput[];
  let service: FeeCatalogService;

  // Vai trò RBAC: cơ quan thu phí (`FEE_COLLECTOR`) là bên được xác nhận thu phí.
  const actor = (roles: string[]) => ({ id: 'user-1', roles });
  const FEE_COLLECTOR = ['FEE_COLLECTOR'];

  const paidDossier = () => makeDeclaration({ type: DeclarationType.IMPORT });

  beforeEach(() => {
    declarations = new InMemoryDeclarationRepository();
    settlement = new MapFeeSettlement();
    auditRecords = [];
    const audit: AuditLogger = {
      record: async (entry) => {
        auditRecords.push(entry);
      },
    };
    // `WorkflowPolicyService` chỉ dùng ở đây cho quy tắc phí/chốt (không chạm phiên xử lý), nhưng
    // constructor của nó cần repo phiên + dịch vụ lộ trình — cấp bản giả lập trong bộ nhớ.
    const workflow = new WorkflowPolicyService(
      new InMemoryWorkflowInstanceRepository(),
      new WorkflowRouteService(new FakeStepDirectory()),
    );
    // SETTINGS_READER giả lập — chưa lưu cấu hình nên trả null (rơi về mặc định 72 giờ hạn thu phí).
    const settings: SettingsReader = { getValue: async () => null };
    // Mặc định hồ sơ đã tới bước thu phí — các test cũ giữ nguyên ý nghĩa.
    feeStepGate = new FakeFeeStepGate(true);
    // Cổng tự tính phí giả lập — mặc định không sinh khoản nào (settlement giữ nguyên do test tự đặt).
    feeCalculator = new FakeDossierFeeCalculator();
    service = new FeeCatalogService(
      declarations,
      workflow,
      new ConfigService(),
      settlement,
      audit,
      settings,
      feeStepGate,
      feeCalculator,
    );
  });

  describe('danh mục màn thu phí', () => {
    const EXPECTED: Record<FeeSlug, 'taxFee' | 'economicZoneFee'> = {
      tax: 'taxFee',
      'economic-zone': 'economicZoneFee',
    };

    it('mỗi màn gắn đúng một khoản phí, khai đủ cả hai chiều', () => {
      expect(Object.keys(EXPECTED).sort()).toEqual([...FEE_SLUGS].sort());
      FEE_SLUGS.forEach((slug) => expect(FEE_SCREENS[slug].force).toBe(EXPECTED[slug]));
    });

    it('cấu hình màn hình trả về mã, không trả nhãn tiếng Việt', () => {
      const screens = service.listScreens();
      expect(screens.map((item) => item.slug)).toEqual([...FEE_SLUGS]);
      screens.forEach((screen) => {
        screen.actions.forEach((action) => expect(FEE_ACTIONS).toContain(action));
        expect(JSON.stringify(screen)).not.toMatch(/[àáảãạăâđêôơư]/i);
      });
    });

    it('màn thu phí KHÔNG còn phơi hành động COLLECT (thu tiền) ra ngoài', () => {
      expect(FEE_ACTIONS).not.toContain('COLLECT' as never);
      service.listScreens().forEach((screen) => expect(screen.actions).not.toContain('COLLECT' as never));
    });

    it('mọi mã hành động đều có tác động được khai tường minh', () => {
      expect(Object.keys(FEE_ACTION_EFFECTS).sort()).toEqual([...FEE_ACTIONS].sort());
    });
  });

  describe('mã lạ bị từ chối, không rơi mặc định về khoản phí Thuế', () => {
    it('slug lạ trả 404 ở cả danh sách lẫn hành động', async () => {
      await expect(service.listItems('phi-bua')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.runAction('phi-bua', 'SUPPLEMENT_PAYMENT', actor(FEE_COLLECTOR), {})).rejects.toThrow(
        'Không có màn thu phí với mã "phi-bua".',
      );
    });

    it('mã hành động bịa bị từ chối 400, không rơi vào nhánh thu tiền', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);

      const promise = service.runAction('tax', 'Thu phí', actor(FEE_COLLECTOR), {
        declarationId: declaration.id,
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestException);
      await expect(promise).rejects.toThrow('Hành động thu phí "Thu phí" không thuộc màn "tax".');
      expect(declaration.auditTrail).toHaveLength(0);
      expect(auditRecords).toHaveLength(0);
    });

    it('COLLECT đã bị gỡ nên bị từ chối 400, không tạo giao dịch/không ghi nhật ký (BUG-007)', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);

      await expect(
        service.runAction('tax', 'COLLECT', actor(FEE_COLLECTOR), { declarationId: declaration.id }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(declaration.auditTrail).toHaveLength(0);
      expect(auditRecords).toHaveLength(0);
    });
  });

  describe('phân quyền xác nhận thu phí theo vai trò RBAC', () => {
    it('vai trò không phải thu phí/quản trị bị từ chối, không đụng tiến độ phí', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);

      await expect(
        service.runAction('tax', 'SUPPLEMENT_PAYMENT', actor(['CUSTOMS']), { declarationId: declaration.id }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(declaration.auditTrail).toHaveLength(0);
      expect(auditRecords).toHaveLength(0);
    });

    it('quản trị hệ thống (SYS_ADMIN) vẫn được thao tác thu phí (chỉ ghi nhật ký)', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);

      await service.runAction('tax', 'SUPPLEMENT_PAYMENT', actor(['SYS_ADMIN']), {
        declarationId: declaration.id,
        amount: 100000,
      });
      // Đường phí không còn chốt khoản phí/đổi trạng thái; chỉ ghi nhật ký thao tác.
      expect(declaration.status).toBe(DeclarationStatus.SUBMITTED);
      expect(declaration.auditTrail).toHaveLength(1);
    });
  });

  describe('tác động của từng mã hành động', () => {
    // Điều kiện tài chính có một nguồn sự thật duy nhất là `settlement`; đường phí (Đường B) nay chỉ
    // kiểm quyền/thứ tự và ghi nhật ký, KHÔNG đặt `declarations.status`/`forceProgress`/bước phí.
    it('SUPPLEMENT_PAYMENT chỉ ghi nhật ký thao tác, KHÔNG đặt trạng thái/tiến độ hồ sơ', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);

      const result = await service.runAction('tax', 'SUPPLEMENT_PAYMENT', actor(FEE_COLLECTOR), {
        declarationId: declaration.id,
        amount: 350000,
      });

      expect(result.action).toBe('SUPPLEMENT_PAYMENT');
      expect(declaration.status).toBe(DeclarationStatus.SUBMITTED);
      expect(declaration.auditTrail).toHaveLength(1);
    });

    it('CANCEL_PAYMENT chỉ ghi nhật ký, KHÔNG đổi trạng thái hồ sơ', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);

      await service.runAction('tax', 'CANCEL_PAYMENT', actor(FEE_COLLECTOR), { declarationId: declaration.id });

      // Hủy/hoàn phí là việc của settlement/giao dịch — đường phí chỉ ghi nhật ký.
      expect(declaration.status).toBe(DeclarationStatus.SUBMITTED);
      expect(declaration.auditTrail).toHaveLength(1);
    });

    it('MERGE_INVOICE chỉ ghi nhật ký, không đổi trạng thái hồ sơ', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);

      await service.runAction('tax', 'MERGE_INVOICE', actor(FEE_COLLECTOR), { declarationId: declaration.id });

      expect(declaration.status).toBe(DeclarationStatus.SUBMITTED);
      expect(declaration.auditTrail).toHaveLength(1);
    });
  });

  describe('BUG-008 — số tiền và trạng thái đọc THẬT từ settlement (một nguồn số)', () => {
    it('dòng phí lấy tổng phải thu / đã thu / còn nợ từ nghĩa vụ tài chính', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);
      // Cùng con số với màn phí theo hồ sơ: đã thu đủ 1.320.000 ₫.
      settlement.set(declaration.id, snap(1_320_000, 1_320_000));

      const [row] = await service.listItems('tax');

      expect(row.amount).toBe(1_320_000);
      expect(row.paid).toBe(1_320_000);
      expect(row.outstanding).toBe(0);
      expect(row.status).toBe(ForceStatus.COMPLETED);
      expect(row.overdue).toBe(false);
    });

    it('SG-193 — hồ sơ mới hoàn tất liên ngành / chờ thanh toán được đẩy lên ĐẦU danh sách thu phí', async () => {
      const d1 = makeDeclaration({ id: 'd-1', code: 'EXP-001', createdAt: new Date('2026-08-18T10:00:00Z'), updatedAt: new Date('2026-08-18T10:00:00Z') });
      const d2 = makeDeclaration({ id: 'd-2', code: 'EXP-002', createdAt: new Date('2026-08-17T08:00:00Z'), updatedAt: new Date('2026-08-20T14:00:00Z') });
      await declarations.save(d1);
      await declarations.save(d2);

      // d1: Đã thanh toán (COMPLETED)
      settlement.set(d1.id, snap(1_320_000, 1_320_000));
      // d2: Mới xong liên ngành, Chờ thanh toán (PENDING)
      settlement.set(d2.id, snap(1_331_002, 0));

      const rows = await service.listItems('tax');

      expect(rows.length).toBe(2);
      // d2 (Chờ thanh toán) phải đẩy lên VỊ TRÍ ĐẦU TIÊN (Row 0)
      expect(rows[0].code).toBe('EXP-002');
      expect(rows[0].status).toBe(ForceStatus.PENDING);
      expect(rows[1].code).toBe('EXP-001');
      expect(rows[1].status).toBe(ForceStatus.COMPLETED);
    });

    it('đã thu một phần → trạng thái PENDING ("Chờ thanh toán"), còn nợ đúng phần chênh lệch', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);
      settlement.set(declaration.id, snap(500_000, 200_000));

      const [row] = await service.listItems('tax');

      expect(row.amount).toBe(500_000);
      expect(row.paid).toBe(200_000);
      expect(row.outstanding).toBe(300_000);
      expect(row.status).toBe(ForceStatus.PENDING);
    });

    it('đã tới bước phí nhưng miễn phí (total = 0) → BỊ LOẠI khỏi danh sách (không có gì để thu/đối soát)', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);
      // Mặc định feeStepGate = đã tới bước phí; total = 0 nghĩa là miễn phí / tính ra 0.

      expect(await service.listItems('tax')).toHaveLength(0);
    });

    it('còn nợ + quá hạn thanh toán → gắn cờ overdue; khoản đã tất toán thì không', async () => {
      const long = new Date('2020-01-01T00:00:00.000Z');
      const owing = makeDeclaration({ id: 'decl-owe', createdAt: long });
      const paid = makeDeclaration({ id: 'decl-paid', createdAt: long });
      declarations.rows.set(owing.id, owing);
      declarations.rows.set(paid.id, paid);
      settlement.set(owing.id, snap(100_000, 0));
      settlement.set(paid.id, snap(100_000, 100_000));

      const rows = await service.listItems('tax');
      expect(rows.find((row) => row.declarationId === owing.id)?.overdue).toBe(true);
      expect(rows.find((row) => row.declarationId === paid.id)?.overdue).toBe(false);
    });
  });

  describe('danh sách chỉ hiện hồ sơ đã tới bước thu phí (quyết định chủ dự án)', () => {
    it('hồ sơ CHƯA tới bước phí bị loại khỏi danh sách; đã tới + có phí thì hiện', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);
      // Có phát sinh phí (total > 0) để tách rõ điều kiện "đã tới bước phí" khỏi điều kiện "miễn phí".
      settlement.set(declaration.id, snap(1_000_000, 0));

      feeStepGate.set(false);
      expect(await service.listItems('tax')).toHaveLength(0);

      feeStepGate.set(true);
      const rows = await service.listItems('tax');
      expect(rows).toHaveLength(1);
      expect(rows[0].feeStepReached).toBe(true);
    });

    it('đã tới bước phí nhưng miễn phí (total = 0) cũng bị loại — hàng đợi chỉ giữ hồ sơ có phí', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);

      feeStepGate.set(true);
      expect(await service.listItems('tax')).toHaveLength(0);
    });

    it('xuất đối soát dùng cùng bộ lọc bước phí — chưa tới bước phí thì không có dòng nào', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);
      settlement.set(declaration.id, snap(1_000_000, 1_000_000));

      feeStepGate.set(false);
      const result = await service.exportItems('tax', {}, actor(FEE_COLLECTOR));

      expect(result.rowCount).toBe(0);
      // Chỉ còn dòng tiêu đề trong tệp CSV.
      const lines = result.content.toString('utf-8').slice(1).split('\r\n').filter(Boolean);
      expect(lines).toHaveLength(1);
    });
  });

  describe('tính phí lười khi liệt kê để tự chữa lành (regression amount>0 ẩn oan)', () => {
    it('hồ sơ ở bước phí nhưng CHƯA có khoản phí → lazy ensureCalculated → có phí → HIỆN trong list', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);
      // Ban đầu chưa tính phí (total = 0) → nếu không lazy-calc sẽ bị `amount > 0` ẩn oan.
      // Cổng tính phí mô phỏng: khi được gọi thì đặt nghĩa vụ tài chính 1.000.000 ₫ cho hồ sơ.
      feeCalculator.onCalculate((id) => settlement.set(id, snap(1_000_000, 0)));

      const rows = await service.listItems('tax');

      expect(feeCalculator.calls).toEqual([declaration.id]);
      expect(rows).toHaveLength(1);
      expect(rows[0].amount).toBe(1_000_000);
    });

    it('KHÔNG tính phí cho hồ sơ chưa tới bước phí (tránh tạo khoản phí sớm)', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);
      feeStepGate.set(false);

      await service.listItems('tax');

      expect(feeCalculator.calls).toHaveLength(0);
    });

    it('hồ sơ miễn phí (lazy-calc xong vẫn total = 0) → vẫn bị ẩn', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);
      // Cổng được gọi nhưng không sinh khoản nào (miễn phí) → settlement giữ total = 0.

      const rows = await service.listItems('tax');

      expect(feeCalculator.calls).toEqual([declaration.id]);
      expect(rows).toHaveLength(0);
    });

    it('một hồ sơ lazy-calc lỗi được BỎ QUA, không làm hỏng cả danh sách', async () => {
      const good = makeDeclaration({ id: 'decl-good' });
      const bad = makeDeclaration({ id: 'decl-bad' });
      declarations.rows.set(good.id, good);
      declarations.rows.set(bad.id, bad);
      // Cổng: hồ sơ tốt sinh phí, hồ sơ xấu ném lỗi.
      feeCalculator.onCalculate((id) => {
        if (id === bad.id) throw new Error('Kho phí lỗi');
        settlement.set(id, snap(500_000, 0));
      });

      const rows = await service.listItems('tax');

      // Hồ sơ lỗi total=0 → bị ẩn; hồ sơ tốt vẫn hiện — danh sách không vỡ.
      expect(rows.map((row) => row.declarationId)).toEqual([good.id]);
    });
  });

  describe('BUG-028 — xuất đối soát phí ở máy chủ (số thật + ghi nhật ký REPORT_EXPORT)', () => {
    it('dựng CSV có BOM/tiêu đề tiếng Việt và một dòng cho mỗi khoản phí đã lọc', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);
      settlement.set(declaration.id, snap(1_320_000, 1_320_000));

      const result = await service.exportItems('tax', {}, actor(FEE_COLLECTOR));

      const text = result.content.toString('utf-8');
      expect(text.charCodeAt(0)).toBe(0xfeff); // BOM UTF-8
      const lines = text.slice(1).split('\r\n'); // bỏ ký tự BOM đầu tệp
      expect(lines[0]).toContain('Mã hồ sơ');
      expect(lines[0]).toContain('Tổng phải thu');
      expect(lines).toHaveLength(2); // 1 tiêu đề + 1 khoản phí
      expect(result.rowCount).toBe(1);
      expect(result.fileName).toMatch(/^doi-soat-phi-tax-\d{8}-\d{4}\.csv$/);
    });

    it('áp bộ lọc nhóm trạng thái: PAID chỉ giữ khoản đã thu đủ', async () => {
      const paid = makeDeclaration({ id: 'decl-paid' });
      const owing = makeDeclaration({ id: 'decl-owe' });
      declarations.rows.set(paid.id, paid);
      declarations.rows.set(owing.id, owing);
      settlement.set(paid.id, snap(100_000, 100_000));
      settlement.set(owing.id, snap(100_000, 0));

      const result = await service.exportItems('tax', { status: 'PAID' }, actor(FEE_COLLECTOR));

      // Chỉ khoản COMPLETED được giữ → 1 dòng dữ liệu (ngoài tiêu đề).
      expect(result.rowCount).toBe(1);
    });

    it('slug lạ trả 404, không dựng tệp', async () => {
      await expect(service.exportItems('phi-bua', {}, actor(FEE_COLLECTOR))).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('BUG-009 — thao tác phí vào audit_logs, không chỉ declaration.auditTrail', () => {
    it('runAction ghi FEE_WORKBENCH_ACTION kèm mã hành động và số tiền', async () => {
      const declaration = paidDossier();
      await declarations.save(declaration);

      await service.runAction('tax', 'SUPPLEMENT_PAYMENT', actor(FEE_COLLECTOR), {
        declarationId: declaration.id,
        amount: 250000,
        note: 'Bổ sung do đổi xe',
      });

      expect(auditRecords).toHaveLength(1);
      const entry = auditRecords[0];
      expect(entry.action).toBe('FEE_WORKBENCH_ACTION');
      expect(entry.targetType).toBe('DECLARATION');
      expect(entry.targetId).toBe(declaration.id);
      expect((entry.after as Record<string, unknown>).feeAction).toBe('SUPPLEMENT_PAYMENT');
      expect((entry.after as Record<string, unknown>).amount).toBe(250000);
    });
  });
});
