import { UserAccessContext } from '../../../../common/auth/access-context';
import { InspectionStatus } from '../../domain/inspection-status.rules';

export interface AssignDispatchCommand {
  dossierId: string;
  gateCode?: string;
  laneCode?: string;
  yardId?: string;
  slotCode?: string;
  note?: string;
  actorId: string;
  access: UserAccessContext;
}

/**
 * Chuyển vị trí (F31). Trường **không gửi lên** giữ nguyên giá trị cũ; muốn bỏ trống một vị trí
 * thì gửi `null` tường minh.
 */
export interface MoveDispatchCommand {
  assignmentId: string;
  gateCode?: string | null;
  laneCode?: string | null;
  yardId?: string | null;
  slotCode?: string | null;
  actorId: string;
  access: UserAccessContext;
}

export interface ReleaseDispatchCommand {
  assignmentId: string;
  actorId: string;
  access: UserAccessContext;
}

/** Cập nhật trạng thái kiểm tra/tập kết của một lượt đỗ (F44). */
export interface ChangeInspectionCommand {
  assignmentId: string;
  status: InspectionStatus;
  note?: string;
  actorId: string;
  access: UserAccessContext;
}

export interface ReleaseYardSlotCommand {
  yardId: string;
  slotCode: string;
  actorId: string;
  access: UserAccessContext;
}

/** Khoá (bảo trì) hoặc mở lại một ô đỗ (F42). `lock = true` là khoá. */
export interface SetYardSlotLockCommand {
  yardId: string;
  slotCode: string;
  lock: boolean;
  actorId: string;
  access: UserAccessContext;
}

export interface GetDispatchBoardCommand {
  checkpoint?: string;
  /** Legacy `YYYY-MM-DD` used to select the queue-ticket day. */
  date?: string;
  /** Mốc đầu ngày Việt Nam của bộ lọc ngày bắt đầu. */
  from?: Date;
  /** Mốc cuối ngày Việt Nam của bộ lọc ngày kết thúc. */
  to?: Date;
  search?: string;
  access: UserAccessContext;
}
