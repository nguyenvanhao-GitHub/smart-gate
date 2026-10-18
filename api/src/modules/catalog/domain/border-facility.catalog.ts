/**
 * Cấu hình vật lý cửa khẩu — cổng, làn, khu bãi (điểm **D8** của kế hoạch).
 *
 * ⚠️ **SỐ LIỆU TẠM.** Chưa có sơ đồ thật của cửa khẩu Chiềng Khương, nên bộ dữ liệu seed bám đúng
 * mockup: Cửa A1/A2 (nhập cảnh), Cửa B1/B2 (xuất cảnh), 4 khu bãi / 89 ô (Kho ngoại quan A01–A24,
 * Bãi container B01–B32, Kho nông sản C01–C18, Bãi xe chờ D01–D15).
 *
 * Cố ý **không** khai thành enum trong mã nguồn: số cổng, số làn, số khu và số ô đều nằm trong
 * danh mục dùng chung (`catalog_types` / `catalog_items`). Khi có sơ đồ thật chỉ cần nhập lại qua
 * màn hình Danh mục — không sửa mã, không deploy.
 */

/**
 * Chiều đi của xe qua cổng.
 * - `ENTRY` — cổng nhập cảnh / cổng vào khu vực cửa khẩu.
 * - `EXIT`  — cổng xuất cảnh / cổng ra khỏi khu vực cửa khẩu.
 *
 * Đây là thuộc tính của **cổng**, khác với `flow` của số thứ tự (thuộc tính của **hồ sơ**).
 */
export enum GateDirection {
  ENTRY = 'ENTRY',
  EXIT = 'EXIT',
}

export const BORDER_GATE_TYPE_CODE = 'BORDER_GATE';
export const GATE_LANE_TYPE_CODE = 'GATE_LANE';
export const YARD_ZONE_TYPE_CODE = 'YARD_ZONE';

export interface BorderGateConfig {
  code: string;
  name: string;
  direction: GateDirection;
  /** Chốt quản lý cổng, dùng lại mã trong `CheckpointCode`. */
  checkpoint: string;
  active: boolean;
}

export interface GateLaneConfig {
  code: string;
  name: string;
  gateCode: string;
  active: boolean;
}

export interface YardZoneConfig {
  code: string;
  name: string;
  /** Sức chứa công bố của khu. Có thể khác `slotCount` khi khu còn ô chưa đánh số. */
  capacity: number;
  /** Tiền tố mã ô đỗ, ví dụ `A` cho các ô `A01`…`A16`. */
  slotPrefix: string;
  slotCount: number;
  active: boolean;
}

/** Sinh danh sách mã ô đỗ của một khu: `A01`, `A02`… Số thứ tự luôn 2 chữ số như mockup. */
export function buildSlotCodes(zone: YardZoneConfig): string[] {
  const codes: string[] = [];
  for (let index = 1; index <= zone.slotCount; index += 1) {
    codes.push(`${zone.slotPrefix}${String(index).padStart(2, '0')}`);
  }
  return codes;
}

/** Chuẩn hoá giá trị `direction` đọc từ danh mục; giá trị lạ được quy về `ENTRY`. */
export function toGateDirection(value: unknown): GateDirection {
  return String(value).toUpperCase() === GateDirection.EXIT ? GateDirection.EXIT : GateDirection.ENTRY;
}
