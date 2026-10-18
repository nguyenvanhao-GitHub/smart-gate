import {
  parseFilterEndDate,
  parseFilterStartDate,
  vietnamDateString,
  vietnamDayEnd,
  vietnamDayStart,
  vietnamTimeString,
} from './vietnam-date';

/**
 * BUG-022 — mã hồ sơ và mốc ngày khung giờ phải cắt theo **giờ Việt Nam** (UTC+7), không theo UTC.
 * Trọng tâm: mốc rơi vào rạng sáng giờ VN (00:00–07:00) — chính là khoảng UTC còn ở ngày hôm trước.
 */
describe('vietnam-date', () => {
  describe('vietnamDateString', () => {
    it('02/08 01:45 giờ VN (18:45 UTC ngày 01/08) vẫn là ngày 2026-08-02, KHÔNG lùi 1 ngày', () => {
      // 01:45 giờ VN = 18:45 UTC hôm trước.
      expect(vietnamDateString(new Date('2026-08-01T18:45:00.000Z'))).toBe('2026-08-02');
    });

    it('00:00 giờ VN đầu ngày (17:00 UTC hôm trước) đã sang ngày mới', () => {
      expect(vietnamDateString(new Date('2026-08-01T17:00:00.000Z'))).toBe('2026-08-02');
    });

    it('23:59 giờ VN cuối ngày (16:59 UTC cùng ngày) vẫn ở đúng ngày đó', () => {
      expect(vietnamDateString(new Date('2026-08-02T16:59:00.000Z'))).toBe('2026-08-02');
    });

    it('giữa trưa giờ VN không đổi ngày', () => {
      expect(vietnamDateString(new Date('2026-08-02T05:00:00.000Z'))).toBe('2026-08-02');
    });
  });

  describe('vietnamTimeString', () => {
    it('trả HH:mm theo giờ VN (cộng 7 giờ so với UTC)', () => {
      expect(vietnamTimeString(new Date('2026-08-01T18:45:00.000Z'))).toBe('01:45');
    });

    it('mốc nửa đêm giờ VN là 00:00', () => {
      expect(vietnamTimeString(new Date('2026-08-01T17:00:00.000Z'))).toBe('00:00');
    });
  });

  // BUG-025 — biên khoảng ngày phải bao trùm cả hai đầu mút theo NGÀY DƯƠNG LỊCH GIỜ VN, không cắt
  // thẳng bằng mốc 00:00 UTC (loại nhầm trọn ngày kết thúc).
  describe('vietnamDayStart', () => {
    it('trả mốc đầu ngày VN (00:00 giờ VN = 17:00 UTC hôm trước)', () => {
      expect(vietnamDayStart(new Date('2026-08-02T09:00:00.000Z')).toISOString()).toBe('2026-08-01T17:00:00.000Z');
    });

    it('mốc rạng sáng giờ VN vẫn quy về đầu đúng ngày VN đó', () => {
      // 01:45 giờ VN ngày 02/08 = 18:45 UTC ngày 01/08.
      expect(vietnamDayStart(new Date('2026-08-01T18:45:00.000Z')).toISOString()).toBe('2026-08-01T17:00:00.000Z');
    });
  });

  describe('vietnamDayEnd', () => {
    it('trả mốc cuối ngày VN (23:59:59.999 giờ VN = 16:59:59.999 UTC cùng ngày)', () => {
      expect(vietnamDayEnd(new Date('2026-08-02T09:00:00.000Z')).toISOString()).toBe('2026-08-02T16:59:59.999Z');
    });

    it('bao trùm bản ghi lúc trưa cùng ngày VN (đầu ngày < bản ghi <= cuối ngày)', () => {
      const at = new Date('2026-08-02T05:00:00.000Z'); // 12:00 giờ VN ngày 02/08
      expect(vietnamDayStart(at).getTime()).toBeLessThanOrEqual(at.getTime());
      expect(vietnamDayEnd(at).getTime()).toBeGreaterThanOrEqual(at.getTime());
    });
  });

  describe('parseFilterStartDate', () => {
    it('chuỗi YYYY-MM-DD được chuyển thành 00:00:00.000 giờ VN (17:00 UTC hôm trước)', () => {
      const date = parseFilterStartDate('2026-08-18');
      expect(date).toBeDefined();
      expect(date?.toISOString()).toBe('2026-08-17T17:00:00.000Z');
    });

    it('chuỗi ISO đầy đủ được giữ nguyên', () => {
      const iso = '2026-08-18T08:30:00.000Z';
      expect(parseFilterStartDate(iso)?.toISOString()).toBe(iso);
    });

    it('trả về undefined nếu chuỗi rỗng hoặc không hợp lệ', () => {
      expect(parseFilterStartDate(undefined)).toBeUndefined();
      expect(parseFilterStartDate('')).toBeUndefined();
      expect(parseFilterStartDate('khong-hop-le')).toBeUndefined();
    });
  });

  describe('parseFilterEndDate', () => {
    it('chuỗi YYYY-MM-DD được chuyển thành 23:59:59.999 giờ VN (16:59:59.999 UTC cùng ngày)', () => {
      const date = parseFilterEndDate('2026-08-18');
      expect(date).toBeDefined();
      expect(date?.toISOString()).toBe('2026-08-18T16:59:59.999Z');
    });

    it('chuỗi ISO đầy đủ được giữ nguyên', () => {
      const iso = '2026-08-18T08:30:00.000Z';
      expect(parseFilterEndDate(iso)?.toISOString()).toBe(iso);
    });

    it('trả về undefined nếu chuỗi rỗng hoặc không hợp lệ', () => {
      expect(parseFilterEndDate(undefined)).toBeUndefined();
      expect(parseFilterEndDate('')).toBeUndefined();
      expect(parseFilterEndDate('khong-hop-le')).toBeUndefined();
    });

    it('bao trùm mọi bản ghi tạo trong ngày 2026-08-18 giờ VN (sáng, trưa, tối)', () => {
      const morning = new Date('2026-08-18T01:00:00.000Z'); // 08:00 VN
      const afternoon = new Date('2026-08-18T08:00:00.000Z'); // 15:00 VN
      const night = new Date('2026-08-18T16:00:00.000Z'); // 23:00 VN
      const nextDay = new Date('2026-08-18T18:00:00.000Z'); // 01:00 VN ngày 19/08

      const end = parseFilterEndDate('2026-08-18')!;
      expect(morning.getTime()).toBeLessThanOrEqual(end.getTime());
      expect(afternoon.getTime()).toBeLessThanOrEqual(end.getTime());
      expect(night.getTime()).toBeLessThanOrEqual(end.getTime());
      expect(nextDay.getTime()).toBeGreaterThan(end.getTime());
    });
  });
});

