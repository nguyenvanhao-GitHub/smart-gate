import {
  DEFAULT_FEE_PAYMENT_DEADLINE_HOURS,
  feePaymentDeadline,
  isFeeOverdue,
  overdueThreshold,
  resolveDeadlineHours,
} from './fee-deadline.rules';

/**
 * Quy tắc "hạn thanh toán phí" (UI-11) — thuần domain, không phụ thuộc Nest. Khóa: chuẩn hóa cấu hình
 * `FEE_PAYMENT_DEADLINE_HOURS` (mặc định 72 khi thiếu/sai), tính mốc hạn, cờ quá hạn ở biên và mốc
 * đếm phục vụ câu SQL.
 */
describe('fee-deadline.rules — hạn thanh toán phí', () => {
  const HOUR = 3_600_000;

  describe('resolveDeadlineHours — chuẩn hóa cấu hình', () => {
    it('số nguyên dương thì dùng nguyên giá trị', () => {
      expect(resolveDeadlineHours(48)).toBe(48);
      expect(resolveDeadlineHours('24')).toBe(24);
      expect(resolveDeadlineHours(1)).toBe(1);
    });

    it('cắt phần thập phân về số nguyên (floor)', () => {
      expect(resolveDeadlineHours('72.9')).toBe(72);
      expect(resolveDeadlineHours(12.4)).toBe(12);
    });

    it('thiếu / rỗng / sai định dạng rơi về mặc định 72', () => {
      expect(resolveDeadlineHours(null)).toBe(DEFAULT_FEE_PAYMENT_DEADLINE_HOURS);
      expect(resolveDeadlineHours(undefined)).toBe(DEFAULT_FEE_PAYMENT_DEADLINE_HOURS);
      expect(resolveDeadlineHours('')).toBe(DEFAULT_FEE_PAYMENT_DEADLINE_HOURS);
      expect(resolveDeadlineHours('abc')).toBe(DEFAULT_FEE_PAYMENT_DEADLINE_HOURS);
      expect(DEFAULT_FEE_PAYMENT_DEADLINE_HOURS).toBe(72);
    });

    it('0 và số âm không hợp lệ, rơi về mặc định', () => {
      expect(resolveDeadlineHours(0)).toBe(DEFAULT_FEE_PAYMENT_DEADLINE_HOURS);
      expect(resolveDeadlineHours(-5)).toBe(DEFAULT_FEE_PAYMENT_DEADLINE_HOURS);
    });
  });

  describe('feePaymentDeadline — mốc hạn = lập + số giờ', () => {
    it('cộng đúng số giờ vào thời điểm lập', () => {
      const created = new Date('2026-07-01T00:00:00.000Z');
      expect(feePaymentDeadline(created, 72).toISOString()).toBe('2026-07-04T00:00:00.000Z');
      expect(feePaymentDeadline(created, 1).getTime()).toBe(created.getTime() + HOUR);
    });
  });

  describe('isFeeOverdue — quá hạn ở biên', () => {
    const created = new Date('2026-07-01T00:00:00.000Z');
    const deadline = feePaymentDeadline(created, 72); // 2026-07-04T00:00:00Z

    it('ngay tại mốc hạn CHƯA quá hạn (dùng >, không phải >=)', () => {
      expect(isFeeOverdue(created, deadline, 72)).toBe(false);
    });

    it('sau mốc hạn 1ms là quá hạn', () => {
      expect(isFeeOverdue(created, new Date(deadline.getTime() + 1), 72)).toBe(true);
    });

    it('trước mốc hạn 1ms chưa quá hạn', () => {
      expect(isFeeOverdue(created, new Date(deadline.getTime() - 1), 72)).toBe(false);
    });
  });

  describe('overdueThreshold — mốc đếm cho câu SQL', () => {
    it('bằng hiện tại lùi lại số giờ hạn', () => {
      const now = new Date('2026-07-10T00:00:00.000Z');
      expect(overdueThreshold(now, 72).toISOString()).toBe('2026-07-07T00:00:00.000Z');
    });

    it('khoản lập trước mốc này thì quá hạn — nhất quán với isFeeOverdue', () => {
      const now = new Date('2026-07-10T12:00:00.000Z');
      const threshold = overdueThreshold(now, 72);
      const createdOverdue = new Date(threshold.getTime() - HOUR);
      const createdFresh = new Date(threshold.getTime() + HOUR);
      expect(isFeeOverdue(createdOverdue, now, 72)).toBe(true);
      expect(isFeeOverdue(createdFresh, now, 72)).toBe(false);
    });
  });
});
