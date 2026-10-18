import { PaginatedResult } from '../../../../common/http/pagination';
import { WorkflowStepStatusCount } from '../../domain/agency-workload.rules';
import { ReportFilter, ReportScope } from '../../domain/report-filter';

export const REPORT_QUERY_REPOSITORY = Symbol('REPORT_QUERY_REPOSITORY');

/**
 * Mọi truy vấn báo cáo đều nhận đủ **bộ lọc + phạm vi dữ liệu**. Không có phương thức nào bỏ
 * `scope`, trừ `findYardCapacity` (chỉ dùng cho cảnh báo hạ tầng và chỉ gọi khi phạm vi là ALL).
 */
export interface ReportQueryCriteria {
  filter: ReportFilter;
  scope: ReportScope;
}

export interface ReportPageQueryCriteria extends ReportQueryCriteria {
  page?: number;
  pageSize?: number;
}

/** Lưu lượng theo giờ trong ngày (0–23). `passed` = lượt xe được cho qua cổng. */
export interface HourlyTrafficRow {
  hour: number;
  submitted: number;
  passed: number;
}

export interface DossierThroughputRow {
  /** `YYYY-MM-DD` theo múi giờ của máy chủ database. */
  date: string;
  total: number;
  submitted: number;
  completed: number;
  rejected: number;
}

/** Cơ cấu hồ sơ **theo luồng** (loại hồ sơ) trong kỳ — dùng cho biểu đồ "theo luồng" của dashboard. */
export interface DossierTypeCountRow {
  /** Mã loại hồ sơ (`EXPORT`/`IMPORT`/`TRANSSHIPMENT`/`SELF_PROPELLED`…). */
  type: string;
  count: number;
}

/**
 * Thống kê nhật ký thao tác gộp theo (bước, quyết định). Trả `totalSeconds` thay vì trung bình để
 * use-case còn cộng dồn được nhiều nhóm mà không bị sai số bình quân của bình quân.
 */
export interface AgencyActionStatRow {
  stepCode: string;
  decision: string;
  actions: number;
  totalSeconds: number;
  maxSeconds: number;
}

export interface GateEventReportRow {
  occurredAt: Date;
  dossierId: string;
  dossierCode: string;
  plateNumber: string;
  gateCode: string;
  direction: string;
  decision: string;
  statusColor: string;
  actorName: string | null;
  note: string | null;
}

export interface GateActionStats {
  entryAllow: number;
  entryDeny: number;
  exitAllow: number;
  exitDeny: number;
}

export interface YardOccupancyRow {
  yardCode: string;
  yardName: string;
  capacity: number;
  slots: number;
  occupied: number;
}

export interface RejectedDossierRow {
  dossierId: string;
  dossierCode: string;
  reasonNote: string | null;
}

/** Ảnh chụp luồng cổng **trong ngày hôm nay** (không theo bộ lọc kỳ) — phục vụ panel tình hình cửa khẩu. */
export interface GateFlowToday {
  /** Số lượt xe được cho qua cổng (`decision = 'ALLOW'`). */
  passed: number;
  /** Số lượt xe bị từ chối tại cổng (`decision = 'DENY'`). */
  denied: number;
}

/** Một hồ sơ đang chờ ở bước hiện tại — dùng cho panel "Cần xử lý sớm". */
export interface AttentionDossierRow {
  dossierId: string;
  dossierCode: string;
  /** Tên doanh nghiệp chủ hồ sơ; `null` với hồ sơ cũ chưa gắn bảng `enterprises`. */
  enterpriseName: string | null;
  /** Mã loại hồ sơ (`EXPORT`/`IMPORT`…). */
  type: string;
  stepCode: string;
  /** Thời điểm hồ sơ vào bước hiện tại — sắp xếp tăng dần để đưa hồ sơ chờ lâu nhất lên đầu. */
  enteredAt: Date;
}

export interface ReportQueryRepository {
  /** Số hồ sơ được gửi và số lượt xe qua cổng theo từng giờ. */
  findHourlyTraffic(criteria: ReportQueryCriteria): Promise<HourlyTrafficRow[]>;
  /** Đếm bước theo trạng thái để dựng bảng "trạng thái theo lực lượng". */
  countWorkflowStepStates(criteria: ReportQueryCriteria): Promise<WorkflowStepStatusCount[]>;
  findDossierThroughput(criteria: ReportQueryCriteria): Promise<DossierThroughputRow[]>;
  /** Đếm hồ sơ theo loại (luồng nhập/xuất/quá cảnh…) trong kỳ, siết theo phạm vi dữ liệu — dashboard "theo luồng". */
  countDossiersByType(criteria: ReportQueryCriteria): Promise<DossierTypeCountRow[]>;
  findAgencyActionStats(criteria: ReportQueryCriteria): Promise<AgencyActionStatRow[]>;
  findGateEvents(criteria: ReportPageQueryCriteria): Promise<PaginatedResult<GateEventReportRow> & { actionStats?: GateActionStats }>;
  findYardOccupancy(criteria: ReportQueryCriteria): Promise<YardOccupancyRow[]>;
  /** Hồ sơ bị từ chối trong kỳ — nguồn của cảnh báo dashboard, có căn cứ dữ liệu thật. */
  findRejectedDossiers(criteria: ReportQueryCriteria, limit: number): Promise<RejectedDossierRow[]>;
  /** Số lượt bị từ chối tại cổng trong kỳ. */
  countGateDenials(criteria: ReportQueryCriteria): Promise<number>;
  /**
   * Số **lượt xe** được cho ra cổng trong kỳ (`gate_events.decision='ALLOW'` và `direction='EXIT'`),
   * siết theo phạm vi dữ liệu — nguồn của KPI "Xe đã rời cửa khẩu". Đo lượt xe qua cổng, **không**
   * đếm hồ sơ theo `status` (cổng không ghi `status=EXITED`).
   */
  countGateExits(criteria: ReportQueryCriteria): Promise<number>;
  /** Sức chứa và số ô đang có xe của **toàn bộ** khu bãi — chỉ gọi khi người dùng có phạm vi ALL. */
  findYardCapacity(): Promise<YardOccupancyRow[]>;
  /**
   * Ảnh chụp hiện thời cho panel "Tình hình cửa khẩu" — cố ý **không** nhận `filter` kỳ vì đây là số
   * liệu thời điểm hiện tại, không phải tổng hợp lịch sử. Đều siết theo `scope` của người dùng.
   */
  getGateFlowToday(scope: ReportScope): Promise<GateFlowToday>;
  /** Số lượt trong hàng đợi hôm nay (số đã cấp trong ngày giờ VN) — ảnh chụp hiện thời, scope-aware. */
  countWaitingQueue(scope: ReportScope): Promise<number>;
  /**
   * Hồ sơ đang chờ **lâu nhất** ở bước hiện tại: các phiên còn `IN_PROGRESS`, sắp theo thời điểm vào
   * bước hiện tại tăng dần. Không tính ngưỡng SLA/quá hạn — chỉ sắp theo thời gian chờ thật.
   */
  findLongestWaitingDossiers(scope: ReportScope, limit: number): Promise<AttentionDossierRow[]>;
}
