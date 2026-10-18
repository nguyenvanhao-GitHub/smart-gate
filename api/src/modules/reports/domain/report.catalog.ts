import { CheckpointCode, DeclarationType } from '../../declarations/domain/declaration.enums';

/** Kiểu điều khiển lọc trên giao diện báo cáo (UI-12). */
export type ReportFilterType = 'date' | 'select' | 'text';

export interface ReportFilterOption {
  value: string;
  label: string;
}

export interface ReportFilterDefinition {
  key: string;
  label: string;
  type: ReportFilterType;
  options?: ReportFilterOption[];
}

/** `duration` = số giây, giao diện và Excel tự đổi sang "x giờ y phút". */
export type ReportColumnType = 'text' | 'number' | 'date' | 'duration';

export interface ReportColumnDefinition {
  key: string;
  label: string;
  type: ReportColumnType;
}

export interface ReportDefinition {
  code: string;
  name: string;
  group: string;
  description: string;
  filters: ReportFilterDefinition[];
  columns: ReportColumnDefinition[];
}

/** Mã báo cáo — dùng ở use-case để chọn nhánh truy vấn. */
export enum ReportCode {
  DOSSIER_THROUGHPUT = 'dossier-throughput',
  AGENCY_PROCESSING_TIME = 'agency-processing-time',
  AGENCY_DECISION = 'agency-decision',
  GATE_EVENT = 'gate-event',
  YARD_OCCUPANCY = 'yard-occupancy',
}

export const DOSSIER_TYPE_LABELS: Record<DeclarationType, string> = {
  [DeclarationType.EXPORT]: 'Xuất khẩu',
  [DeclarationType.IMPORT]: 'Nhập khẩu',
  [DeclarationType.TRANSSHIPMENT_EXPORT]: 'Sang tải đầu xuất',
  [DeclarationType.TRANSSHIPMENT_IMPORT]: 'Sang tải đầu nhập',
  [DeclarationType.SELF_PROPELLED]: 'Xe tự hành',
};

export const CHECKPOINT_LABELS: Record<CheckpointCode, string> = {
  [CheckpointCode.A1]: 'A1 - Cửa A1 (Nhập cảnh)',
  [CheckpointCode.A2]: 'A2 - Cửa A2 (Nhập cảnh)',
  [CheckpointCode.B1]: 'B1 - Cửa B1 (Xuất cảnh)',
  [CheckpointCode.B2]: 'B2 - Cửa B2 (Xuất cảnh)',
  [CheckpointCode.B5]: 'B5 - Xuất bãi',
  [CheckpointCode.YARD]: 'Bãi kiểm hóa',
  [CheckpointCode.SMART_GATE]: 'Smart gate',
};

const FROM_FILTER: ReportFilterDefinition = { key: 'from', label: 'Từ ngày', type: 'date' };
const TO_FILTER: ReportFilterDefinition = { key: 'to', label: 'Đến ngày', type: 'date' };

const CHECKPOINT_FILTER: ReportFilterDefinition = {
  key: 'checkpoint',
  label: 'Chốt',
  type: 'select',
  options: Object.values(CheckpointCode).map((value) => ({ value, label: CHECKPOINT_LABELS[value] })),
};

const TYPE_FILTER: ReportFilterDefinition = {
  key: 'type',
  label: 'Loại hình',
  type: 'select',
  options: Object.values(DeclarationType).map((value) => ({ value, label: DOSSIER_TYPE_LABELS[value] })),
};

export const INSPECTION_REPORT_AGENCY_CODES = ['BORDER_GUARD', 'CUSTOMS', 'QUARANTINE'] as const;

export const INSPECTION_AGENCY_FILTER: ReportFilterDefinition = {
  key: 'agencyCode',
  label: 'Lực lượng',
  type: 'select',
  options: [
    { value: 'BORDER_GUARD', label: 'Biên phòng' },
    { value: 'CUSTOMS', label: 'Hải quan' },
    { value: 'QUARANTINE', label: 'Kiểm dịch' },
  ],
};
export const AGENCY_FILTER = INSPECTION_AGENCY_FILTER;

/**
 * Danh mục báo cáo (F51–F56). **Mọi báo cáo ở đây đều chạy truy vấn thật** trên
 * `declarations` / `workflow_instance_steps` / `agency_actions` / `gate_events` /
 * `dispatch_assignments`. Không còn dòng dữ liệu dựng sẵn nào.
 *
 * Phần thu phí (F51 đối soát phí) **chưa có** vì điểm D6 đã chốt hoãn: chưa có biểu phí chính thức
 * thì không dựng báo cáo tiền. Thêm vào đây khi D6 mở lại.
 */
export const REPORT_CATALOG: ReportDefinition[] = [
  {
    code: ReportCode.DOSSIER_THROUGHPUT,
    name: 'Lưu lượng hồ sơ theo ngày',
    group: 'Hồ sơ',
    description: 'Số hồ sơ tạo, gửi, hoàn thành và bị từ chối theo từng ngày trong kỳ.',
    filters: [FROM_FILTER, TO_FILTER, TYPE_FILTER],
    columns: [
      { key: 'date', label: 'Ngày', type: 'text' },
      { key: 'total', label: 'Hồ sơ tạo', type: 'number' },
      { key: 'submitted', label: 'Đã gửi', type: 'number' },
      { key: 'completed', label: 'Hoàn thành', type: 'number' },
      { key: 'rejected', label: 'Từ chối', type: 'number' },
    ],
  },
  {
    code: ReportCode.AGENCY_PROCESSING_TIME,
    name: 'Thời gian xử lý theo lực lượng',
    group: 'Liên ngành',
    description:
      'Số lượt xử lý và thời gian giữ hồ sơ của từng bước, lấy từ nhật ký thao tác của lực lượng (F26, F53).',
    filters: [FROM_FILTER, TO_FILTER, INSPECTION_AGENCY_FILTER],
    columns: [
      { key: 'agencyName', label: 'Lực lượng', type: 'text' },
      { key: 'stepName', label: 'Bước nghiệp vụ', type: 'text' },
      { key: 'actions', label: 'Lượt xử lý', type: 'number' },
      { key: 'averageSeconds', label: 'Thời gian trung bình', type: 'duration' },
      { key: 'maxSeconds', label: 'Thời gian lâu nhất', type: 'duration' },
    ],
  },
  {
    code: ReportCode.AGENCY_DECISION,
    name: 'Quyết định theo lực lượng',
    group: 'Liên ngành',
    description: 'Số lượt xác nhận hoàn thành, yêu cầu sửa đổi/bổ sung và từ chối của từng lực lượng (F55).',
    filters: [FROM_FILTER, TO_FILTER, INSPECTION_AGENCY_FILTER],
    columns: [
      { key: 'agencyName', label: 'Lực lượng', type: 'text' },
      { key: 'approve', label: 'Xác nhận hoàn thành', type: 'number' },
      { key: 'requestSupplement', label: 'Yêu cầu sửa đổi, bổ sung', type: 'number' },
      { key: 'reject', label: 'Từ chối', type: 'number' },
      { key: 'total', label: 'Tổng lượt', type: 'number' },
    ],
  },
  {
    code: ReportCode.GATE_EVENT,
    name: 'Nhật ký qua cổng',
    group: 'Cổng',
    description: 'Từng lượt xác nhận/từ chối tại cổng kèm kết quả đánh giá điều kiện lúc đó (F38, F54).',
    filters: [FROM_FILTER, TO_FILTER, CHECKPOINT_FILTER, TYPE_FILTER],
    columns: [
      { key: 'occurredAt', label: 'Thời điểm', type: 'date' },
      { key: 'dossierCode', label: 'Mã hồ sơ', type: 'text' },
      { key: 'plateNumber', label: 'Biển số xe', type: 'text' },
      { key: 'gateCode', label: 'Cổng', type: 'text' },
      { key: 'direction', label: 'Chiều', type: 'text' },
      { key: 'decision', label: 'Kết quả', type: 'text' },
      { key: 'statusColor', label: 'Đèn', type: 'text' },
      { key: 'actorName', label: 'Người ghi nhận', type: 'text' },
      { key: 'note', label: 'Ghi chú', type: 'text' },
    ],
  },
  {
    code: ReportCode.YARD_OCCUPANCY,
    name: 'Tồn bãi theo khu',
    group: 'Kho bãi',
    description:
      'Sức chứa và số ô đang có xe của từng khu bãi (F56). Số ô đang có xe được đếm trong phạm vi dữ liệu của người dùng.',
    filters: [],
    columns: [
      { key: 'yardCode', label: 'Mã khu', type: 'text' },
      { key: 'yardName', label: 'Tên khu', type: 'text' },
      { key: 'capacity', label: 'Sức chứa công bố', type: 'number' },
      { key: 'slots', label: 'Số ô đang mở', type: 'number' },
      { key: 'occupied', label: 'Ô đang có xe', type: 'number' },
      { key: 'available', label: 'Ô còn trống', type: 'number' },
    ],
  },
];

export function findReportDefinition(code: string): ReportDefinition | undefined {
  return REPORT_CATALOG.find((item) => item.code === code);
}
