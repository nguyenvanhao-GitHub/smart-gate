import {
  DEFAULT_MAX_YARD_STORAGE_HOURS,
  computeExpectedDeparture,
  isOverdue,
  overdueThreshold,
  resolveMaxStorageHours,
} from './yard-storage.rules';

/**
 * Quy tắc "giờ lưu bãi tối đa" (F42/F44) — trái tim của tính **dự kiến rời bãi** và cờ **quá hạn**.
 * Test thuần, không mock: chỉ số học thời gian với mốc cố định (KHÔNG dùng `Date.now` thật).
 */
describe('Quy tắc giờ lưu bãi (F42/F44)', () => {
  describe('resolveMaxStorageHours — chuẩn hoá cấu hình', () => {
    it('rơi về mặc định 48 khi thiếu (null/undefined/chuỗi rỗng)', () => {
      expect(resolveMaxStorageHours(null)).toBe(DEFAULT_MAX_YARD_STORAGE_HOURS);
      expect(resolveMaxStorageHours(undefined)).toBe(DEFAULT_MAX_YARD_STORAGE_HOURS);
      expect(resolveMaxStorageHours('')).toBe(48);
    });

    it('rơi về mặc định khi sai định dạng hoặc không dương (chữ, 0, âm)', () => {
      expect(resolveMaxStorageHours('không-phải-số')).toBe(48);
      expect(resolveMaxStorageHours(0)).toBe(48);
      expect(resolveMaxStorageHours('0')).toBe(48);
      expect(resolveMaxStorageHours(-5)).toBe(48);
    });

    it('dùng số nguyên dương hợp lệ, kể cả dạng chuỗi', () => {
      expect(resolveMaxStorageHours(24)).toBe(24);
      expect(resolveMaxStorageHours('72')).toBe(72);
      expect(resolveMaxStorageHours(1)).toBe(1);
    });

    it('làm tròn xuống phần thập phân (12.9 → 12)', () => {
      expect(resolveMaxStorageHours('12.9')).toBe(12);
      expect(resolveMaxStorageHours(48.5)).toBe(48);
    });
  });

  describe('computeExpectedDeparture — mốc dự kiến rời bãi', () => {
    it('cộng đúng số giờ lưu vào giờ vào bãi', () => {
      const assignedAt = new Date('2026-07-28T00:00:00.000Z');
      expect(computeExpectedDeparture(assignedAt, 48)).toEqual(new Date('2026-07-30T00:00:00.000Z'));
      expect(computeExpectedDeparture(assignedAt, 6)).toEqual(new Date('2026-07-28T06:00:00.000Z'));
    });

    it('không thay đổi mốc gốc (trả về Date mới)', () => {
      const assignedAt = new Date('2026-07-28T00:00:00.000Z');
      computeExpectedDeparture(assignedAt, 12);
      expect(assignedAt.toISOString()).toBe('2026-07-28T00:00:00.000Z');
    });
  });

  describe('isOverdue — đã quá mốc rời bãi hay chưa', () => {
    const expected = new Date('2026-07-30T00:00:00.000Z');

    it('true khi hiện tại đã vượt mốc', () => {
      expect(isOverdue(expected, new Date('2026-07-30T00:00:00.001Z'))).toBe(true);
      expect(isOverdue(expected, new Date('2026-07-31T00:00:00.000Z'))).toBe(true);
    });

    it('false khi chưa tới mốc', () => {
      expect(isOverdue(expected, new Date('2026-07-29T23:59:59.999Z'))).toBe(false);
    });

    it('false đúng tại mốc (biên: strictly greater)', () => {
      expect(isOverdue(expected, new Date('2026-07-30T00:00:00.000Z'))).toBe(false);
    });
  });

  describe('overdueThreshold — mốc để đếm ở tầng database', () => {
    it('bằng hiện tại trừ đi số giờ lưu tối đa', () => {
      const now = new Date('2026-07-30T12:00:00.000Z');
      expect(overdueThreshold(now, 48)).toEqual(new Date('2026-07-28T12:00:00.000Z'));
      expect(overdueThreshold(now, 12)).toEqual(new Date('2026-07-30T00:00:00.000Z'));
    });
  });
});
