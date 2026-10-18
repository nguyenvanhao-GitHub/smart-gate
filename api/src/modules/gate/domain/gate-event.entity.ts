import { randomUUID } from 'crypto';
import { GateDirection } from '../../catalog/domain/border-facility.catalog';

export enum GateDecision {
  /** Xác nhận cho qua cổng. */
  ALLOW = 'ALLOW',
  /** Từ chối cho qua cổng. */
  DENY = 'DENY',
}

export type GateStatusColor = 'GREEN' | 'YELLOW' | 'RED';

/** Một dòng checklist tại cổng đã được nhân viên tích/ghi chú (F39). */
export interface GateChecklistState {
  code: string;
  checked: boolean;
  note: string | null;
}

export interface GateEventRecordInput {
  dossierId: string;
  gateCode: string;
  direction: GateDirection;
  decision: GateDecision;
  canOpen: boolean;
  statusColor: GateStatusColor;
  blockingReasons: string[];
  checklist: GateChecklistState[];
  note: string | null;
  actorId: string;
  actorName: string | null;
  at?: Date;
}

/**
 * Sự kiện qua cổng — bảng `gate_events` (F38).
 *
 * Ghi nhận **thủ công**, không điều khiển barie: F40 thuộc Giai đoạn 2 (quyết định A0).
 * Bản ghi lưu lại nguyên trạng kết quả đánh giá tại thời điểm quyết định — kể cả khi từ chối —
 * để sau này đối chiếu được "lúc đó còn thiếu những gì".
 */
export class GateEvent {
  constructor(
    public readonly id: string,
    public readonly dossierId: string,
    public readonly gateCode: string,
    public readonly direction: GateDirection,
    public readonly decision: GateDecision,
    public readonly canOpen: boolean,
    public readonly statusColor: GateStatusColor,
    public readonly blockingReasons: string[],
    public readonly checklist: GateChecklistState[],
    public readonly note: string | null,
    public readonly actorId: string,
    public readonly actorName: string | null,
    public readonly occurredAt: Date,
  ) {}

  static record(input: GateEventRecordInput): GateEvent {
    return new GateEvent(
      randomUUID(),
      input.dossierId,
      input.gateCode,
      input.direction,
      input.decision,
      input.canOpen,
      input.statusColor,
      input.blockingReasons,
      input.checklist,
      input.note,
      input.actorId,
      input.actorName,
      input.at ?? new Date(),
    );
  }

  /** Xe thực sự đã qua cổng ra — căn cứ để giải phóng vị trí trong bãi (F44). */
  get releasesPosition(): boolean {
    return this.decision === GateDecision.ALLOW && this.direction === GateDirection.EXIT;
  }
}
