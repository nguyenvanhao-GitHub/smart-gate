import { UserAccessContext } from '../../../../common/auth/access-context';
import { GateDirection } from '../../../catalog/domain/border-facility.catalog';
import { GateDecision } from '../../domain/gate-event.entity';

export interface GateChecklistInput {
  code: string;
  checked: boolean;
  note?: string;
}

export interface RecordGateEventCommand {
  dossierId: string;
  gateCode?: string;
  direction?: GateDirection;
  decision: GateDecision;
  checklist?: GateChecklistInput[];
  note?: string;
  /**
   * CR2 — nút "Ưu tiên kiểm dịch" ở cổng vào. Cho xe qua chiều VÀO kèm cờ này thì **bật cờ dịch tễ
   * nguyên tử**: cụm nghiệp vụ mở ra chỉ có Kiểm dịch, Biên phòng/Hải quan chờ tới khi Kiểm dịch xong.
   * Chỉ có tác dụng với cổng VÀO + quyết định CHO QUA; không có đường gỡ cờ.
   */
  prioritizeQuarantine?: boolean;
  actorId: string;
  /** Tên người thao tác để lưu vào nhật ký cổng (cột "Người xử lý"). Lấy từ token đăng nhập. */
  actorName?: string;
  access: UserAccessContext;
}

export interface LookupGateDossierCommand {
  /** Mã hồ sơ nhập tay tại cổng. Chỗ này sau sẽ nhận thêm chuỗi từ đầu đọc QR (điểm C2). */
  code: string;
  gateCode?: string;
  direction?: GateDirection;
  access: UserAccessContext;
}

export interface ListGateEventsCommand {
  dossierId?: string;
  dossierCode?: string;
  plateNumber?: string;
  gateCode?: string;
  direction?: GateDirection;
  decision?: GateDecision;
  actorName?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  access: UserAccessContext;
}

export interface GateSummaryCommand {
  gateCode?: string;
  access: UserAccessContext;
}