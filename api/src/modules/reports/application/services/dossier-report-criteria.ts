import { DeclarationSearchCriteria } from '../../../declarations/application/ports/declaration.repository';
import {
  CheckpointCode,
  DeclarationStatus,
  DeclarationType,
  statusesForGroup,
} from '../../../declarations/domain/declaration.enums';
import { ReportScope, parseFilterEndDate, parseFilterStartDate } from '../../domain/report-filter';

/**
 * Đổi **query param của màn hình danh sách hồ sơ** thành điều kiện truy vấn hồ sơ.
 *
 * ⚠️ Hàm này phải khớp từng dòng với `DeclarationsController.list` — cùng tên tham số, cùng cách
 * đổi chuỗi ngày sang `Date`. Đó là lý do dashboard đếm được KPI bằng chính bộ lọc mà nó gửi kèm
 * trong `drilldown.queryParams`: mở danh sách ra thì số dòng bằng đúng con số trên thẻ KPI.
 * Sửa một bên mà quên bên kia là hỏng điều kiện nghiệm thu của mốc M3.
 */
export function dossierCriteriaFromDrilldown(
  queryParams: Record<string, string>,
  scope: ReportScope,
): DeclarationSearchCriteria {
  return {
    type: queryParams.type as DeclarationType | undefined,
    status: queryParams.status as DeclarationStatus | undefined,
    statuses: statusesForGroup(queryParams.statusGroup),
    checkpoint: queryParams.checkpoint as CheckpointCode | undefined,
    fromDate: parseFilterStartDate(queryParams.from),
    toDate: parseFilterEndDate(queryParams.to),
    scope,
  };
}

