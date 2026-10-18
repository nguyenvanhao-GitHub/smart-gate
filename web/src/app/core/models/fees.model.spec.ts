import { TestBed } from '@angular/core/testing';
import { I18nService, LOCALE_STORAGE_KEY } from '../i18n/i18n.service';
import {
  FEE_ACTION_CODES,
  FEE_ACTION_VIEWS,
  FeeRow,
  FeeRuleVersion,
  distinctFeeTypes,
  feeActionLabel,
  feeAmountByGroup,
  feeAmountOverdue,
  feeAmountPaid,
  feeAmountTotal,
  feeAmountUnpaid,
  feeRowMatchesStatus,
  feeStatusCount,
  feeStatusLabel,
  groupFeeRuleVersions,
} from './fees.model';

/**
 * Trước đây loại hành động và nhóm trạng thái phí được đoán từ nhãn tiếng Việt
 * (`includes('Hủy')`, so `row.status === 'Chờ thanh toán'`). Bộ test này khoá việc tra theo **mã**.
 */
describe('fees.model', () => {
  it('mỗi mã hành động có đủ nhãn/biểu tượng/tông màu/kiểu modal', () => {
    FEE_ACTION_CODES.forEach((code) => {
      const view = FEE_ACTION_VIEWS[code];
      expect(view.labelKey).toBeTruthy();
      expect(view.icon).toBeTruthy();
      expect(view.tone).toBeTruthy();
      expect(view.mode).toBeTruthy();
    });
  });

  it('kiểu modal suy từ mã, không dò nhãn', () => {
    expect(FEE_ACTION_VIEWS.SUPPLEMENT_PAYMENT.mode).toBe('payment');
    expect(FEE_ACTION_VIEWS.CANCEL_PAYMENT.mode).toBe('cancel');
    expect(FEE_ACTION_VIEWS.MERGE_INVOICE.mode).toBe('merge');
    expect(FEE_ACTION_VIEWS.MERGE_PAYMENT.mode).toBe('merge');
  });

  it('COLLECT (thu tiền) đã bị gỡ khỏi danh mục hành động màn thu phí', () => {
    expect(FEE_ACTION_CODES).not.toContain('COLLECT' as never);
    expect((FEE_ACTION_VIEWS as Record<string, unknown>)['COLLECT']).toBeUndefined();
  });

  it('đếm trạng thái theo mã ForceStatus, không theo nhãn', () => {
    const rows = [
      { status: 'PENDING' },
      { status: 'PROCESSING' },
      { status: 'COMPLETED' },
      { status: 'REVISION_REQUIRED' },
    ];
    expect(feeStatusCount(rows, 'WAITING')).toBe(2);
    expect(feeStatusCount(rows, 'PAID')).toBe(1);
    expect(feeStatusCount(rows, 'SUPPLEMENT')).toBe(1);
  });

  describe('nhãn dịch được', () => {
    let i18n: I18nService;
    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({});
      i18n = TestBed.inject(I18nService);
    });
    afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));

    it('nhãn hành động và trạng thái đổi theo ngôn ngữ', () => {
      expect(feeActionLabel('CANCEL_PAYMENT')).toBe('Hủy thanh toán phí');
      expect(feeStatusLabel('COMPLETED')).toBe('Đã thanh toán');
      i18n.setLocale('en');
      expect(feeActionLabel('CANCEL_PAYMENT', i18n.t)).toBe('Cancel fee payment');
      expect(feeStatusLabel('COMPLETED', i18n.t)).toBe('Paid');
    });

    it('mã trạng thái lạ hiện nguyên mã, không vỡ giao diện', () => {
      expect(feeStatusLabel('MA_LA', i18n.t)).toBe('MA_LA');
    });
  });

  // ---------------------------------------------------------------------------
  describe('KPI tiền và lọc danh sách phí (UI-11)', () => {
    function row(mau: Partial<FeeRow> = {}): FeeRow {
      return {
        code: 'HS-001',
        plate: '29C-12345',
        trailer: '',
        taxCode: '',
        company: 'Công ty A',
        feeType: 'INFRASTRUCTURE',
        amount: 100_000,
        paid: 0,
        outstanding: 100_000,
        status: 'PENDING',
        createdAt: '2026-07-01T00:00:00.000Z',
        overdue: false,
        ...mau,
      };
    }

    const rows: FeeRow[] = [
      row({ amount: 100_000, paid: 0, outstanding: 100_000, status: 'PENDING', feeType: 'INFRASTRUCTURE', overdue: true }),
      row({ amount: 200_000, paid: 200_000, outstanding: 0, status: 'COMPLETED', feeType: 'PARKING', overdue: false }),
      row({ amount: 300_000, paid: 100_000, outstanding: 200_000, status: 'PROCESSING', feeType: 'INFRASTRUCTURE', overdue: false }),
    ];

    it('feeAmountTotal cộng đúng tổng phải thu, bỏ qua giá trị không phải số', () => {
      expect(feeAmountTotal(rows)).toBe(600_000);
      expect(feeAmountTotal([row({ amount: NaN }), row({ amount: 50_000 })])).toBe(50_000);
      expect(feeAmountTotal([])).toBe(0);
    });

    it('feeAmountByGroup cộng tiền theo nhóm trạng thái mã', () => {
      expect(feeAmountByGroup(rows, 'PAID')).toBe(200_000);
      expect(feeAmountByGroup(rows, 'WAITING')).toBe(400_000);
      expect(feeAmountByGroup(rows, 'SUPPLEMENT')).toBe(0);
    });

    it('feeAmountPaid cộng tiền ĐÃ THU thật từ trường paid của từng dòng', () => {
      expect(feeAmountPaid(rows)).toBe(300_000);
      expect(feeAmountPaid([row({ paid: NaN }), row({ paid: 40_000 })])).toBe(40_000);
    });

    it('feeAmountUnpaid = tổng còn phải thu thật (outstanding), không âm', () => {
      expect(feeAmountUnpaid(rows)).toBe(300_000);
      // Dữ liệu lệch (outstanding âm) vẫn kẹp về 0, không âm.
      expect(feeAmountUnpaid([row({ outstanding: -5_000 })])).toBe(0);
    });

    it('feeAmountOverdue chỉ cộng phần còn nợ của khoản có cờ overdue', () => {
      expect(feeAmountOverdue(rows)).toBe(100_000);
      expect(feeAmountOverdue([row({ overdue: false })])).toBe(0);
    });

    it('distinctFeeTypes trả danh sách mã nhóm phí duy nhất, sắp xếp, bỏ rỗng', () => {
      expect(distinctFeeTypes(rows)).toEqual(['INFRASTRUCTURE', 'PARKING']);
      expect(distinctFeeTypes([row({ feeType: '' }), row({ feeType: 'TAX' })])).toEqual(['TAX']);
    });

    describe('feeRowMatchesStatus', () => {
      it("ALL luôn khớp", () => {
        expect(feeRowMatchesStatus(row({ status: 'PENDING', overdue: false }), 'ALL')).toBe(true);
      });

      it('OVERDUE lọc theo CỜ overdue, không theo mã trạng thái', () => {
        expect(feeRowMatchesStatus(row({ status: 'PENDING', overdue: true }), 'OVERDUE')).toBe(true);
        // Cùng trạng thái PENDING nhưng không quá hạn → không khớp OVERDUE.
        expect(feeRowMatchesStatus(row({ status: 'PENDING', overdue: false }), 'OVERDUE')).toBe(false);
      });

      it('nhóm mã lọc theo trạng thái (không phụ thuộc cờ overdue)', () => {
        expect(feeRowMatchesStatus(row({ status: 'COMPLETED' }), 'PAID')).toBe(true);
        expect(feeRowMatchesStatus(row({ status: 'PROCESSING' }), 'WAITING')).toBe(true);
        expect(feeRowMatchesStatus(row({ status: 'COMPLETED' }), 'WAITING')).toBe(false);
      });
    });
  });

  describe('groupFeeRuleVersions', () => {
    function createVersion(partial: Partial<FeeRuleVersion> = {}): FeeRuleVersion {
      return {
        id: 'r-1',
        code: 'INFRA_GATE',
        name: 'Phí hạ tầng',
        feeType: 'INFRASTRUCTURE',
        unit: 'TRIP',
        amount: 1_000_000,
        currency: 'VND',
        appliesTo: [],
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        active: true,
        sortOrder: 10,
        description: null,
        status: 'ACTIVE',
        ...partial,
      };
    }

    it('gom nhóm theo feeType thay vì gom theo code', () => {
      const versions: FeeRuleVersion[] = [
        createVersion({ id: '1', code: 'INFRA_01', name: 'Phí hạ tầng xe tải', feeType: 'INFRASTRUCTURE' }),
        createVersion({ id: '2', code: 'INFRA_02', name: 'Phí hạ tầng container', feeType: 'INFRASTRUCTURE' }),
        createVersion({ id: '3', code: 'PARKING_01', name: 'Phí lưu bãi', feeType: 'PARKING' }),
      ];

      const groups = groupFeeRuleVersions(versions);
      expect(groups.length).toBe(2);
      expect(groups[0].feeType).toBe('INFRASTRUCTURE');
      expect(groups[0].versions.length).toBe(2);
      expect(groups[1].feeType).toBe('PARKING');
      expect(groups[1].versions.length).toBe(1);
    });

    it('sắp xếp các nhóm theo thứ tự chuẩn FEE_TYPE_CODES', () => {
      const versions: FeeRuleVersion[] = [
        createVersion({ id: '1', code: 'TAX_01', feeType: 'TAX' }),
        createVersion({ id: '2', code: 'INFRA_01', feeType: 'INFRASTRUCTURE' }),
        createVersion({ id: '3', code: 'SERVICE_01', feeType: 'SERVICE' }),
      ];

      const groups = groupFeeRuleVersions(versions);
      expect(groups.map((g) => g.feeType)).toEqual(['INFRASTRUCTURE', 'SERVICE', 'TAX']);
    });

    it('sắp xếp các bản ghi trong nhóm theo sortOrder ASC và effectiveFrom ASC', () => {
      const versions: FeeRuleVersion[] = [
        createVersion({ id: 'v2', code: 'INFRA_02', sortOrder: 20, effectiveFrom: '2026-02-01' }),
        createVersion({ id: 'v1', code: 'INFRA_01', sortOrder: 10, effectiveFrom: '2026-01-01' }),
        createVersion({ id: 'v3', code: 'INFRA_03', sortOrder: 30, effectiveFrom: '2026-03-01' }),
      ];

      const groups = groupFeeRuleVersions(versions);
      expect(groups[0].versions.map((v) => v.id)).toEqual(['v1', 'v2', 'v3']);
    });
  });
});
