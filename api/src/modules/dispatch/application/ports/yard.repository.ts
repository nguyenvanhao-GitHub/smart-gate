import { YardZoneConfig } from '../../../catalog/domain/border-facility.catalog';
import { Yard } from '../../domain/yard.entity';

export const YARD_REPOSITORY = Symbol('YARD_REPOSITORY');

export interface YardRepository {
  /** Toàn bộ khu bãi kèm ô đỗ, sắp theo mã khu rồi mã ô. */
  listYards(): Promise<Yard[]>;
  findYardById(id: string): Promise<Yard | null>;
  findYardByCode(code: string): Promise<Yard | null>;
  /**
   * Đồng bộ khu/ô theo cấu hình danh mục `YARD_ZONE` (điểm **D8**) — danh mục là nguồn sự thật:
   * tên, sức chứa và trạng thái khoá được cập nhật theo danh mục. Ô đỗ thì **chỉ thêm, không
   * xoá**, vì ô có thể đang có xe đứng; giảm số ô là việc phải làm tay sau khi giải phóng.
   * Idempotent — chạy lại mỗi lần khởi động không tạo dữ liệu trùng.
   */
  ensureLayout(zones: YardZoneConfig[]): Promise<void>;

  /**
   * Bật/tắt ô đỗ (F42 — khoá bảo trì / mở lại). `isActive = false` là ô bị khoá.
   * Trả số ô được cập nhật (0 nghĩa là không có ô nào khớp mã trong khu).
   */
  setSlotActive(yardId: string, slotCode: string, isActive: boolean): Promise<number>;
}
