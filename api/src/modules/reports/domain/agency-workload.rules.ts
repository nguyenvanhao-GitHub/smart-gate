import { agencyName, workflowStepMetadata } from '../../declarations/domain/workflow-step.catalog';
import { WorkflowStepStatus } from '../../workflow/domain/workflow.enums';

/**
 * Các lực lượng được thống kê trên dashboard và báo cáo liên ngành.
 * Bước khai báo của doanh nghiệp (`ENTERPRISE`) không phải lực lượng nên bị loại.
 */
export const REPORT_AGENCY_CODES = ['BORDER_GUARD', 'CUSTOMS', 'QUARANTINE', 'FEE_COLLECTOR'];

/** Một ô của bảng đếm bước theo trạng thái, đọc từ `workflow_instance_steps`. */
export interface WorkflowStepStatusCount {
  stepCode: string;
  status: string;
  count: number;
}

/**
 * Một dòng "trạng thái theo lực lượng" trên dashboard.
 *
 * Quy ước đếm (đếm **bước**, không đếm hồ sơ — một hồ sơ có thể đi qua cùng lực lượng hai bước):
 * - `waiting`    = bước `PENDING` (chưa tới lượt) + `WAITING_SUPPLEMENT` (đang chờ doanh nghiệp bổ sung)
 * - `processing` = bước `IN_PROGRESS` — hồ sơ **đang nằm ở** lực lượng này
 * - `completed`  = bước `COMPLETED`
 *
 * Bước `REJECTED` cố ý **không** vào ô nào: hồ sơ đã dừng, gộp vào "hoàn thành" sẽ đọc sai.
 * Số hồ sơ bị từ chối nằm ở KPI riêng của dashboard.
 */
export interface AgencyWorkloadRow {
  agencyCode: string;
  agencyName: string;
  waiting: number;
  processing: number;
  completed: number;
}

function emptyRow(agencyCode: string): AgencyWorkloadRow {
  return { agencyCode, agencyName: agencyName(agencyCode), waiting: 0, processing: 0, completed: 0 };
}

/** Gộp bảng đếm theo mã bước thành bảng theo lực lượng. Hàm thuần — không chạm DB, test được. */
export function aggregateAgencyWorkload(counts: WorkflowStepStatusCount[]): AgencyWorkloadRow[] {
  const rows = new Map<string, AgencyWorkloadRow>(REPORT_AGENCY_CODES.map((code) => [code, emptyRow(code)]));

  counts.forEach((item) => {
    const agencyCode = workflowStepMetadata(item.stepCode)?.agencyCode;
    if (!agencyCode) return;
    const row = rows.get(agencyCode);
    if (!row) return;

    if (item.status === WorkflowStepStatus.PENDING || item.status === WorkflowStepStatus.WAITING_SUPPLEMENT) {
      row.waiting += item.count;
      return;
    }
    if (item.status === WorkflowStepStatus.IN_PROGRESS) {
      row.processing += item.count;
      return;
    }
    if (item.status === WorkflowStepStatus.COMPLETED) {
      row.completed += item.count;
    }
  });

  return [...rows.values()];
}
