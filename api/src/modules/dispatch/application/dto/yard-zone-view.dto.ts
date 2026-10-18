import { YardZoneConfig } from '../../../catalog/domain/border-facility.catalog';
import { Yard } from '../../domain/yard.entity';

/**
 * Một khu bãi đỗ kèm sức chứa công bố và số ô đang có xe (F42, GET /catalog/yard-zones).
 *
 * `capacity`/`slotCount`/`active` lấy từ danh mục `YARD_ZONE` (điểm D8 — danh mục là nguồn sự thật);
 * `used` là số liệu vận hành đọc từ bảng vị trí điều phối nên không nằm trong danh mục.
 */
export interface YardZoneView {
  code: string;
  name: string;
  /** Sức chứa công bố của khu (số ô tối đa cho xe đứng). */
  capacity: number;
  /** Số ô đỗ đã đánh số trong khu (sinh từ `slotPrefix` + `slotCount`). */
  slotCount: number;
  active: boolean;
  /** Số ô đang có xe đứng — không bao giờ âm. */
  used: number;
}

export function toYardZoneView(zone: YardZoneConfig, used: number): YardZoneView {
  return {
    code: zone.code,
    name: zone.name,
    capacity: zone.capacity,
    slotCount: zone.slotCount,
    active: zone.active,
    used: Math.max(0, used),
  };
}

/**
 * Quy số ô đang có xe (khoá theo `yardId`) về khoá mã khu, khớp mã danh mục `YARD_ZONE`.
 * Bảng `yards` được đồng bộ từ danh mục nên `yard.code` trùng mã khu (A/B/C).
 */
export function occupiedByZoneCode(yards: Yard[], occupiedByYardId: Map<string, number>): Map<string, number> {
  const map = new Map<string, number>();
  for (const yard of yards) map.set(yard.code, occupiedByYardId.get(yard.id) ?? 0);
  return map;
}
