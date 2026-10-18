/**
 * Vòng đời trạng thái kiểm tra/tập kết của một lượt đỗ trong bãi (F44).
 *
 * Đây là **thuộc tính của xe đang đỗ** (lượt điều phối), KHÔNG phải của ô đỗ — trạng thái chiếm chỗ
 * vật lý của ô (`ParkingSlotStatus` FREE/OCCUPIED) giữ nguyên. Quy tắc chuyển bước đặt ở `domain/`
 * để test được; chuyển sai bước bị chặn ở API (mẫu như `workflow-order.rules`) → 409.
 */
export enum InspectionStatus {
  /** Xe vừa vào bãi, chờ đến lượt kiểm tra. */
  WAITING_INSPECTION = 'WAITING_INSPECTION',
  /** Đang kiểm tra thực tế. */
  INSPECTING = 'INSPECTING',
  /** Kiểm tra xong. */
  INSPECTION_DONE = 'INSPECTION_DONE',
  /** Sang tải / tập kết. */
  CONSOLIDATING = 'CONSOLIDATING',
}

/** Các bước chuyển hợp lệ — dây chuyền tuyến tính, tiến từng bước một. */
const ALLOWED_TRANSITIONS: Readonly<Record<InspectionStatus, readonly InspectionStatus[]>> = {
  [InspectionStatus.WAITING_INSPECTION]: [InspectionStatus.INSPECTING],
  [InspectionStatus.INSPECTING]: [InspectionStatus.INSPECTION_DONE],
  [InspectionStatus.INSPECTION_DONE]: [InspectionStatus.CONSOLIDATING],
  [InspectionStatus.CONSOLIDATING]: [],
};

export function canTransitionInspection(from: InspectionStatus, to: InspectionStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Ném khi chuyển trạng thái kiểm tra sai thứ tự. Lỗi domain thuần; use-case đổi thành 409. */
export class InspectionTransitionError extends Error {
  constructor(
    public readonly from: InspectionStatus,
    public readonly to: InspectionStatus,
  ) {
    super(`Không chuyển được trạng thái kiểm tra từ ${from} sang ${to}.`);
    this.name = 'InspectionTransitionError';
  }
}
