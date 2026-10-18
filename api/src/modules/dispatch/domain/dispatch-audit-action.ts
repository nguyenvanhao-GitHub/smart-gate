import { DispatchPlacement } from './dispatch-assignment.entity';

/**
 * Mã hành động ghi vết điều phối trong nhật ký kiểm toán (F33 · F05).
 *
 * Là **mã ASCII trong tập đóng** — không dùng chuỗi hiển thị làm logic. Ba use-case gán/chuyển/bỏ
 * vị trí ghi đúng một trong ba mã này; màn "Lịch sử điều phối" lọc audit theo đúng tập này.
 */
export const DispatchAuditAction = {
  ASSIGN: 'DISPATCH_ASSIGN',
  MOVE: 'DISPATCH_MOVE',
  RELEASE: 'DISPATCH_RELEASE',
} as const;

export type DispatchAuditAction = (typeof DispatchAuditAction)[keyof typeof DispatchAuditAction];

/** Danh sách mã dùng để lọc audit khi tra lịch sử điều phối. */
export const DISPATCH_AUDIT_ACTIONS: readonly DispatchAuditAction[] = Object.values(DispatchAuditAction);

/** Ảnh chụp vị trí lưu vào `before/after` của nhật ký — đúng bốn trường web cần hiển thị từ→đến. */
export interface DispatchPlacementSnapshot {
  gate: string | null;
  lane: string | null;
  yard: string | null;
  slot: string | null;
}

/** Chuyển vị trí điều phối thành ảnh chụp phẳng để ghi vào nhật ký kiểm toán. */
export function placementSnapshot(placement: DispatchPlacement): Record<string, string | null> {
  return {
    gate: placement.gateCode,
    lane: placement.laneCode,
    yard: placement.yardId,
    slot: placement.slotCode,
  };
}
