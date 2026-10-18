import { DeclarationStatus, DeclarationStatusGroup } from '../../declarations/domain/declaration.enums';

/** Tông màu thẻ KPI trên UI-02. Khớp bảng màu trạng thái của SRS 8.1. */
export type DashboardKpiTone = 'idle' | 'processing' | 'done' | 'waiting' | 'rejected';

/**
 * Nguồn đếm con số của thẻ KPI:
 * - `DOSSIER`   — đếm **hồ sơ** bằng đúng bộ lọc danh sách (một trạng thái, một nhóm, hoặc không lọc).
 * - `GATE_EXIT` — đếm **lượt xe ra cổng** từ `gate_events` (`decision=ALLOW`, `direction=EXIT`). Đây
 *   là đơn vị "lượt xe", không phải "hồ sơ", nên **không** quy về bộ lọc danh sách hồ sơ (ngoại lệ
 *   có chủ đích của bất biến M3 — xem chú thích ở use-case).
 */
export type DashboardKpiSource = 'DOSSIER' | 'GATE_EXIT';

/**
 * Một thẻ KPI của dashboard.
 *
 * ⚠️ KPI nguồn `DOSSIER` **bắt buộc** quy được về đúng một bộ lọc của danh sách hồ sơ (một trạng
 * thái qua `status`, hoặc một nhóm trạng thái qua `statusGroup`). Con số hiển thị được đếm bằng
 * chính bộ lọc ấy, nên "mở danh sách nguồn ra thì số lượng khớp" là đúng theo cấu tạo chứ không
 * nhờ trùng hợp. KPI nguồn `GATE_EXIT` là ngoại lệ đo lượt xe qua cổng.
 */
export interface DashboardKpiDefinition {
  key: string;
  label: string;
  unit: string;
  tone: DashboardKpiTone;
  source: DashboardKpiSource;
  /** Trạng thái đơn dùng làm bộ lọc (chỉ với `DOSSIER`). `null` = không lọc theo một trạng thái. */
  status: DeclarationStatus | null;
  /**
   * Nhóm trạng thái (mã đóng) — dùng **thay** cho `status` khi thẻ đại diện nhiều trạng thái cùng
   * một giai đoạn vòng đời (vd "Đang xử lý" = `IN_PROGRESS`). Drilldown mang `statusGroup`, số đếm
   * `status IN (nhóm)`; danh sách hồ sơ nhận đúng nhóm này nên số khớp.
   */
  statusGroup?: DeclarationStatusGroup;
  /**
   * KPI này có so được xu hướng "hôm nay so với hôm qua" theo **ngày tạo hồ sơ** không.
   *
   * ⚠️ Chỉ `total` bật cờ này. Các KPI còn lại lọc theo **trạng thái hiện tại** — chúng là số tồn
   * kho/snapshot (đang chờ, đang xử lý…) hoặc trạng thái kết thúc (hoàn thành, từ chối) hoặc lượt xe
   * qua cổng. Đếm chúng theo ngày tạo rồi so hôm nay/hôm qua sẽ **lệch theo vòng đời** → **bịa xu
   * hướng**. Kho dữ liệu cũng chỉ đếm được theo `created_at`, không có mốc "hoàn thành lúc nào" để
   * so cho đúng. Vì vậy chúng KHÔNG gắn trend (đúng chủ trương "không bịa").
   */
  trendComparable?: boolean;
}

export const DASHBOARD_KPI_CATALOG: DashboardKpiDefinition[] = [
  { key: 'total', label: 'Tổng hồ sơ trong kỳ', unit: 'hồ sơ', tone: 'idle', source: 'DOSSIER', status: null, trendComparable: true },
  { key: 'waiting_gate', label: 'Chờ vào cổng', unit: 'hồ sơ', tone: 'waiting', source: 'DOSSIER', status: DeclarationStatus.WAITING_GATE },
  // "Đang xử lý nghiệp vụ" = NHÓM vòng đời liên ngành (WAITING_CALL + BUSINESS_PROCESSING + REVISION_REQUIRED + WAITING_FOR_FEE + READY_FOR_EXIT)
  { key: 'business_processing', label: 'Đang xử lý nghiệp vụ', unit: 'hồ sơ', tone: 'processing', source: 'DOSSIER', status: null, statusGroup: DeclarationStatusGroup.BUSINESS_PROCESS },
  {
    key: 'needSupplement',
    label: 'Cần bổ sung',
    unit: 'hồ sơ',
    tone: 'waiting',
    source: 'DOSSIER',
    status: DeclarationStatus.REVISION_REQUIRED,
  },
  { key: 'completed', label: 'Hoàn thành thủ tục', unit: 'hồ sơ', tone: 'done', source: 'DOSSIER', status: DeclarationStatus.COMPLETED },
  { key: 'rejected', label: 'Bị từ chối', unit: 'hồ sơ', tone: 'rejected', source: 'DOSSIER', status: DeclarationStatus.REJECTED },
];
