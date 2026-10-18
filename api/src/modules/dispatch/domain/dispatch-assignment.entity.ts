import { randomUUID } from 'crypto';
import { InspectionStatus, InspectionTransitionError, canTransitionInspection } from './inspection-status.rules';

export enum DispatchAssignmentStatus {
  /** Xe đang chiếm vị trí này. Chỉ có **một** bản ghi ACTIVE cho mỗi xe và mỗi ô đỗ. */
  ACTIVE = 'ACTIVE',
  /** Đã giải phóng — giữ lại làm dấu vết, không xoá vật lý. */
  RELEASED = 'RELEASED',
}

/** Vị trí được gán: cổng, làn, và/hoặc ô đỗ trong một khu bãi. */
export interface DispatchPlacement {
  gateCode: string | null;
  laneCode: string | null;
  yardId: string | null;
  slotCode: string | null;
}

export interface DispatchAssignInput extends DispatchPlacement {
  dossierId: string;
  assignedById: string | null;
  note: string | null;
  at?: Date;
}

/**
 * Vị trí điều phối của một xe/hồ sơ — bảng `dispatch_assignments` (F29, F31, F43).
 *
 * Hai luật "một xe không nằm ở hai vị trí" và "một ô đỗ không chứa hai xe" **được chặn bằng hai
 * chỉ mục duy nhất có điều kiện trong database** (chỉ áp cho các dòng `status = 'ACTIVE'`).
 * Use-case vẫn kiểm trước để trả thông báo dễ hiểu, nhưng lớp chặn thật nằm ở database — kiểm
 * trong mã không cứu được hai yêu cầu chạy song song.
 */
export class DispatchAssignment {
  constructor(
    public readonly id: string,
    public readonly dossierId: string,
    public gateCode: string | null,
    public laneCode: string | null,
    public yardId: string | null,
    public slotCode: string | null,
    public status: DispatchAssignmentStatus,
    public readonly assignedAt: Date,
    public releasedAt: Date | null,
    public readonly assignedById: string | null,
    public note: string | null,
    public updatedAt: Date,
    /** Trạng thái kiểm tra/tập kết của lượt đỗ (F44). Mặc định chờ kiểm tra khi mới gán. */
    public inspectionStatus: InspectionStatus = InspectionStatus.WAITING_INSPECTION,
    /** Mốc lần đổi trạng thái kiểm tra gần nhất; null khi chưa đổi lần nào. */
    public inspectionUpdatedAt: Date | null = null,
  ) {}

  static assign(input: DispatchAssignInput): DispatchAssignment {
    const at = input.at ?? new Date();
    return new DispatchAssignment(
      randomUUID(),
      input.dossierId,
      input.gateCode,
      input.laneCode,
      input.yardId,
      input.slotCode,
      DispatchAssignmentStatus.ACTIVE,
      at,
      null,
      input.assignedById,
      input.note,
      at,
      InspectionStatus.WAITING_INSPECTION,
      null,
    );
  }

  get isActive(): boolean {
    return this.status === DispatchAssignmentStatus.ACTIVE;
  }

  /** Đang đỗ trong bãi khi có đủ khu **và** ô — thiếu một trong hai thì chỉ là gán cổng/làn. */
  get isInYard(): boolean {
    return !!this.yardId && !!this.slotCode;
  }

  get placement(): DispatchPlacement {
    return { gateCode: this.gateCode, laneCode: this.laneCode, yardId: this.yardId, slotCode: this.slotCode };
  }

  /** Chuyển vị trí (F31). Trường không được khai trong `placement` giữ nguyên giá trị cũ. */
  moveTo(placement: Partial<DispatchPlacement>, at: Date = new Date()): void {
    if (placement.gateCode !== undefined) this.gateCode = placement.gateCode;
    if (placement.laneCode !== undefined) this.laneCode = placement.laneCode;
    if (placement.yardId !== undefined) this.yardId = placement.yardId;
    if (placement.slotCode !== undefined) this.slotCode = placement.slotCode;
    this.updatedAt = at;
  }

  /**
   * Chuyển trạng thái kiểm tra/tập kết (F44). Sai thứ tự ném `InspectionTransitionError` để tầng
   * trên đổi thành 409 — chặn ở API, không chỉ ẩn nút.
   */
  changeInspection(to: InspectionStatus, at: Date = new Date()): void {
    if (!canTransitionInspection(this.inspectionStatus, to)) {
      throw new InspectionTransitionError(this.inspectionStatus, to);
    }
    this.inspectionStatus = to;
    this.inspectionUpdatedAt = at;
    this.updatedAt = at;
  }

  /** Giải phóng vị trí khi xe rời đi (F44). Bản ghi được giữ lại để tra cứu. */
  release(at: Date = new Date()): void {
    this.status = DispatchAssignmentStatus.RELEASED;
    this.releasedAt = at;
    this.updatedAt = at;
  }
}
