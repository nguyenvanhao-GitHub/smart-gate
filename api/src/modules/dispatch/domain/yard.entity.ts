import { randomUUID } from 'crypto';

export enum ParkingSlotStatus {
  FREE = 'FREE',
  OCCUPIED = 'OCCUPIED',
  /** Ô bị khoá/bảo trì (`ParkingSlot.isActive = false`) — không nhận xe. */
  MAINTENANCE = 'MAINTENANCE',
}

/** Một ô đỗ — bảng `parking_slots` (F42). Mã ô duy nhất trong phạm vi một khu. */
export class ParkingSlot {
  constructor(
    public readonly id: string,
    public readonly yardId: string,
    public readonly code: string,
    public sortOrder: number,
    public isActive: boolean,
  ) {}

  static create(yardId: string, code: string, sortOrder: number): ParkingSlot {
    return new ParkingSlot(randomUUID(), yardId, code, sortOrder, true);
  }
}

/** Khu bãi — bảng `yards` (F42). Sức chứa và danh sách ô lấy từ danh mục `YARD_ZONE` (điểm D8). */
export class Yard {
  constructor(
    public readonly id: string,
    public readonly code: string,
    public name: string,
    public capacity: number,
    public isActive: boolean,
    public slots: ParkingSlot[] = [],
  ) {}

  static create(code: string, name: string, capacity: number): Yard {
    return new Yard(randomUUID(), code, name, capacity, true, []);
  }

  hasSlot(slotCode: string): boolean {
    return this.slots.some((slot) => slot.code === slotCode && slot.isActive);
  }

  /**
   * Còn chỗ hay không, tính theo **sức chứa công bố**. `occupied` là số ô đang có xe, do tầng ứng
   * dụng đếm từ bảng vị trí điều phối — khu bãi không tự giữ trạng thái xe.
   */
  hasRoom(occupied: number): boolean {
    return occupied < this.capacity;
  }
}
