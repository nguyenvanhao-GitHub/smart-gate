import { DossierSummary } from '../../../declarations/application/dto/dossier-view.dto';
import { GateDirection } from '../../../catalog/domain/border-facility.catalog';
import { GateChecklistItem, GateConditionResult } from '../../domain/gate-condition.rules';
import { GateChecklistState, GateDecision, GateEvent, GateStatusColor } from '../../domain/gate-event.entity';
import { GateEventRow } from '../ports/gate-event.repository';

export interface GateSummaryView {
  code: string;
  name: string;
  direction: GateDirection;
}

/** Kết quả tra cứu hồ sơ tại cổng (UI-09 · F37, F39). */
export interface GateLookupView {
  dossier: DossierSummary;
  gate: GateSummaryView;
  evaluation: GateConditionResult;
  checklist: GateChecklistItem[];
}

export interface GateEventView {
  id: string;
  dossierId: string;
  dossierCode: string;
  plateNumber: string;
  gateCode: string;
  /** Tên cổng tra từ danh mục — để nhật ký không phải hiện mã cổng trần. */
  gateName: string;
  direction: GateDirection;
  decision: GateDecision;
  canOpen: boolean;
  statusColor: GateStatusColor;
  blockingReasons: string[];
  checklist: GateChecklistState[];
  note: string | null;
  actorId: string;
  actorName: string | null;
  occurredAt: Date;
}

export function toGateEventView(
  event: GateEvent,
  dossierCode: string,
  plateNumber: string,
  gateName: string,
): GateEventView {
  return {
    id: event.id,
    dossierId: event.dossierId,
    dossierCode,
    plateNumber,
    gateCode: event.gateCode,
    gateName,
    direction: event.direction,
    decision: event.decision,
    canOpen: event.canOpen,
    statusColor: event.statusColor,
    blockingReasons: event.blockingReasons,
    checklist: event.checklist,
    note: event.note,
    actorId: event.actorId,
    actorName: event.actorName,
    occurredAt: event.occurredAt,
  };
}

export function toGateEventViewFromRow(row: GateEventRow, gateName: string): GateEventView {
  return toGateEventView(row.event, row.dossierCode, row.plateNumber, gateName);
}

/** Tổng hợp lượt qua cổng trong ngày (KPI của UI-09). */
export interface GateTodaySummaryView {
  /** Cổng được lọc, `null` khi tính gộp mọi cổng. */
  gateCode: string | null;
  /** Số lượt cho qua (`ALLOW`) hôm nay. */
  allowed: number;
  /** Số lượt từ chối (`DENY`) hôm nay. */
  denied: number;
  /** Tổng số lượt ghi nhận hôm nay. */
  total: number;
}
