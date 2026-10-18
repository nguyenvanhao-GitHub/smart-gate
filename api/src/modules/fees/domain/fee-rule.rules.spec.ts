import { DeclarationType } from '../../declarations/domain/declaration.enums';
import { makeFeeRule } from '../testing/fee.fixture';
import { applyDateOf, isEffectiveAt, pickEffectiveRules } from './fee-rule.rules';

/**
 * F46 — chọn **bản biểu phí đang hiệu lực**. Chỗ dễ sai nhất của phân hệ phí: lấy "bản mới nhất"
 * là sai, vì bản mới có thể ban hành trước mà chưa tới ngày áp dụng.
 */
describe('fee-rule.rules (F46)', () => {
  it('applyDateOf trả về ngày YYYY-MM-DD của mốc thời gian', () => {
    expect(applyDateOf(new Date('2026-03-15T23:30:00.000Z'))).toBe('2026-03-15');
  });

  describe('isEffectiveAt', () => {
    const rule = makeFeeRule({ effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30' });

    it.each([
      ['trước ngày hiệu lực', '2025-12-31', false],
      ['đúng ngày bắt đầu', '2026-01-01', true],
      ['giữa khoảng', '2026-03-01', true],
      ['đúng ngày kết thúc (bao gồm)', '2026-06-30', true],
      ['sau ngày kết thúc', '2026-07-01', false],
    ])('%s → %s', (_ten, at, expected) => {
      expect(isEffectiveAt(rule, at)).toBe(expected);
    });

    it('bản đã tắt thì không hiệu lực dù đang trong khoảng ngày', () => {
      expect(isEffectiveAt(makeFeeRule({ active: false }), '2026-03-01')).toBe(false);
    });

    it('không khai ngày hết hiệu lực = còn hiệu lực vô thời hạn', () => {
      expect(isEffectiveAt(makeFeeRule({ effectiveTo: null }), '2099-01-01')).toBe(true);
    });
  });

  describe('pickEffectiveRules', () => {
    /** Ba bản của cùng một khoản phí: bản cũ đã đóng, bản đang chạy, bản tương lai. */
    const banCu = makeFeeRule({ id: 'cu', amount: 800_000, effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31' });
    const banDangChay = makeFeeRule({ id: 'dang-chay', amount: 1_000_000, effectiveFrom: '2026-01-01', effectiveTo: null });
    const banTuongLai = makeFeeRule({ id: 'tuong-lai', amount: 1_200_000, effectiveFrom: '2026-09-01', effectiveTo: null });

    it('lấy đúng bản đang hiệu lực, KHÔNG lấy bản mới nhất đã ban hành', () => {
      const chosen = pickEffectiveRules([banCu, banDangChay, banTuongLai], '2026-03-01');
      expect(chosen).toHaveLength(1);
      expect(chosen[0].id).toBe('dang-chay');
      expect(chosen[0].amount).toBe(1_000_000);
    });

    it('tra ngược ngày cũ thì ra đúng mức phí đã áp dụng lúc đó', () => {
      const chosen = pickEffectiveRules([banCu, banDangChay, banTuongLai], '2025-06-01');
      expect(chosen[0].amount).toBe(800_000);
    });

    it('tới ngày hiệu lực thì bản mới thay bản cũ, mỗi mã chỉ còn một bản', () => {
      const chosen = pickEffectiveRules([banCu, banDangChay, banTuongLai], '2026-09-01');
      expect(chosen).toHaveLength(1);
      expect(chosen[0].id).toBe('tuong-lai');
    });

    it('lọc theo loại hồ sơ; bản khai rỗng áp dụng cho mọi loại', () => {
      const chungChoMoiLoai = makeFeeRule({ code: 'INFRA_GATE', appliesTo: [], sortOrder: 10 });
      const chiChoXuat = makeFeeRule({ code: 'EXPORT_ONLY', appliesTo: [DeclarationType.EXPORT], sortOrder: 20 });

      const nhap = pickEffectiveRules([chungChoMoiLoai, chiChoXuat], '2026-03-01', DeclarationType.IMPORT);
      expect(nhap.map((rule) => rule.code)).toEqual(['INFRA_GATE']);

      const xuat = pickEffectiveRules([chungChoMoiLoai, chiChoXuat], '2026-03-01', DeclarationType.EXPORT);
      expect(xuat.map((rule) => rule.code)).toEqual(['INFRA_GATE', 'EXPORT_ONLY']);
    });

    it('lọc theo loại phương tiện (VEHICLE_TYPE); khớp cả loại xe và loại hồ sơ', () => {
      const chung = makeFeeRule({ code: 'ALL', appliesTo: [], sortOrder: 10 });
      const xeContainer = makeFeeRule({ code: 'CONTAINER_FEE', appliesTo: ['CONTAINER'], sortOrder: 20 });
      const xeTaiXuat = makeFeeRule({ code: 'TRUCK_EXPORT_FEE', appliesTo: ['TRUCK', DeclarationType.EXPORT], sortOrder: 30 });

      // Xe tải + Nhập khẩu: khớp chung
      const xeTaiNhap = pickEffectiveRules([chung, xeContainer, xeTaiXuat], '2026-03-01', DeclarationType.IMPORT, 'TRUCK');
      expect(xeTaiNhap.map((r) => r.code)).toEqual(['ALL']);

      // Xe tải + Xuất khẩu: khớp chung và TRUCK_EXPORT_FEE
      const xeTaiXuatResult = pickEffectiveRules([chung, xeContainer, xeTaiXuat], '2026-03-01', DeclarationType.EXPORT, 'TRUCK');
      expect(xeTaiXuatResult.map((r) => r.code)).toEqual(['ALL', 'TRUCK_EXPORT_FEE']);

      // Container + Xuất khẩu: khớp chung và CONTAINER_FEE
      const containerXuat = pickEffectiveRules([chung, xeContainer, xeTaiXuat], '2026-03-01', DeclarationType.EXPORT, 'CONTAINER');
      expect(containerXuat.map((r) => r.code)).toEqual(['ALL', 'CONTAINER_FEE']);
    });

    it('kết quả sắp theo sortOrder nên bảng phí luôn hiện cùng thứ tự', () => {
      const vat = makeFeeRule({ code: 'VAT', sortOrder: 90 });
      const haTang = makeFeeRule({ code: 'INFRA_GATE', sortOrder: 10 });
      expect(pickEffectiveRules([vat, haTang], '2026-03-01').map((rule) => rule.code)).toEqual([
        'INFRA_GATE',
        'VAT',
      ]);
    });
  });
});
