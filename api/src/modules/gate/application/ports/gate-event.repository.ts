import { PaginatedResult } from '../../../../common/http/pagination';
import { GateDirection } from '../../../catalog/domain/border-facility.catalog';
import { GateDecision, GateEvent } from '../../domain/gate-event.entity';

export const GATE_EVENT_REPOSITORY = Symbol('GATE_EVENT_REPOSITORY');

export interface GateEventPageCriteria {
  dossierId?: string;
  dossierCode?: string;
  plateNumber?: string;
  gateCode?: string;
  direction?: GateDirection;
  decision?: GateDecision;
  actorName?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
  unrestricted: boolean;
  ownerUserId?: string;
  taxCodes?: string[];
}

/** Một dòng nhật ký cổng kèm nhãn hồ sơ để hiển thị. */
export interface GateEventRow {
  event: GateEvent;
  dossierCode: string;
  plateNumber: string;
}

/** Tiêu chí đếm lượt qua cổng trong ngày (KPI UI-09) — cùng phạm vi dữ liệu với nhật ký. */
export interface GateEventSummaryCriteria {
  gateCode?: string;
  unrestricted: boolean;
  ownerUserId?: string;
  taxCodes?: string[];
}

/** Số lượt cho qua / từ chối trong ngày. */
export interface GateEventSummary {
  allowed: number;
  denied: number;
}

export interface GateEventRepository {
  append(event: GateEvent): Promise<GateEvent>;
  /** Sự kiện gần nhất của hồ sơ — dùng để nạp lại trạng thái checklist đã tích lần trước. */
  findLatestByDossier(dossierId: string): Promise<GateEvent | null>;
  /**
   * Các **chiều** (VÀO/RA) mà hồ sơ đã được **cho qua** — dùng để kiểm trình tự lượt vào/ra trước
   * khi ghi thêm (F38). Không tính lượt bị từ chối.
   */
  findAllowedDirections(dossierId: string): Promise<GateDirection[]>;
  findPage(criteria: GateEventPageCriteria): Promise<PaginatedResult<GateEventRow>>;
  /** Đếm lượt cho qua / từ chối kể từ đầu ngày (`date_trunc('day', now())`). */
  summarizeToday(criteria: GateEventSummaryCriteria): Promise<GateEventSummary>;
}
