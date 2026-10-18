import { UserAccessContext } from '../../../../common/auth/access-context';
import { ReportFilter } from '../../domain/report-filter';

export interface RunReportCommand {
  code: string;
  filter: ReportFilter;
  page?: number;
  pageSize?: number;
  /** Quyền hiệu lực của người gọi — nguồn duy nhất để suy ra phạm vi dữ liệu. */
  access: UserAccessContext;
}

export interface ExportReportCommand {
  code: string;
  filter: ReportFilter;
  access: UserAccessContext;
  actorId: string;
  actorRole?: string;
  actorName?: string;
}

export interface DashboardOverviewCommand {
  from?: string;
  to?: string;
  checkpoint?: string;
  access: UserAccessContext;
}
