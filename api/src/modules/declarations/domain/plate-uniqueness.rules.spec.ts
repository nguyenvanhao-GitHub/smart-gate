import { DeclarationStatus } from './declaration.enums';
import { occupiesPlate, PLATE_BLOCKING_STATUSES, PlateInUseError } from './plate-uniqueness.rules';

/**
 * Chống trùng biển số (F09) — thuần domain. Khóa: tập trạng thái "đang giữ chỗ" khớp đúng khoảng giữa
 * vòng đời (bỏ nháp và các trạng thái đã kết thúc), và cờ `occupiesPlate` chỉ chặn khi có biển số thật.
 */
describe('plate-uniqueness.rules — chống trùng biển số (F09)', () => {
  describe('PLATE_BLOCKING_STATUSES — tập trạng thái giữ chỗ', () => {
    it('bao gồm các trạng thái đang xử lý giữa vòng đời', () => {
      const blocking = [
        DeclarationStatus.SUBMITTED,
        DeclarationStatus.PROCESSING,
        DeclarationStatus.REVISION_REQUIRED,
        DeclarationStatus.WAITING_BORDER_GUARD,
        DeclarationStatus.WAITING_CUSTOMS,
        DeclarationStatus.WAITING_QUARANTINE,
        DeclarationStatus.WAITING_FOR_FEE,
        DeclarationStatus.WAITING_GATE,
        DeclarationStatus.PAID,
        DeclarationStatus.READY_FOR_EXIT,
      ];
      blocking.forEach((status) => expect(PLATE_BLOCKING_STATUSES).toContain(status));
      expect(PLATE_BLOCKING_STATUSES).toHaveLength(blocking.length);
    });

    it('KHÔNG chặn hồ sơ nháp (chưa vào cuộc) và các trạng thái đã kết thúc', () => {
      // Nháp còn đang soạn; đã hủy/từ chối/rời cửa khẩu/hoàn thành đều đã kết thúc.
      [
        DeclarationStatus.DRAFT,
        DeclarationStatus.EXITED,
        DeclarationStatus.COMPLETED,
        DeclarationStatus.REJECTED,
        DeclarationStatus.CANCELLED,
      ].forEach((status) => expect(PLATE_BLOCKING_STATUSES).not.toContain(status));
    });
  });

  describe('occupiesPlate — có giữ chỗ biển số không', () => {
    it('trạng thái đang xử lý + có biển số ⇒ giữ chỗ', () => {
      expect(occupiesPlate(DeclarationStatus.PROCESSING, '29C-12345')).toBe(true);
      expect(occupiesPlate(DeclarationStatus.WAITING_GATE, '29C-12345')).toBe(true);
    });

    it('trạng thái đã kết thúc / nháp ⇒ không giữ chỗ dù có biển số', () => {
      expect(occupiesPlate(DeclarationStatus.DRAFT, '29C-12345')).toBe(false);
      expect(occupiesPlate(DeclarationStatus.CANCELLED, '29C-12345')).toBe(false);
      expect(occupiesPlate(DeclarationStatus.COMPLETED, '29C-12345')).toBe(false);
    });

    it('không có biển số (rỗng / khoảng trắng / undefined) ⇒ không giữ chỗ', () => {
      expect(occupiesPlate(DeclarationStatus.PROCESSING, '')).toBe(false);
      expect(occupiesPlate(DeclarationStatus.PROCESSING, '   ')).toBe(false);
      expect(occupiesPlate(DeclarationStatus.PROCESSING, undefined)).toBe(false);
    });
  });

  describe('PlateInUseError — lỗi domain thuần', () => {
    it('giữ biển số và tên lỗi để tầng ghi đổi thành 409', () => {
      const error = new PlateInUseError('29C-12345');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('PlateInUseError');
      expect(error.plateNumber).toBe('29C-12345');
      expect(error.message).toContain('29C-12345');
    });
  });
});
