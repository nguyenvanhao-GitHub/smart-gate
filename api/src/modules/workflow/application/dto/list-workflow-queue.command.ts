import { UserAccessContext } from '../../../../common/auth/access-context';
import { CheckpointCode, DeclarationStatus, DeclarationType } from '../../../declarations/domain/declaration.enums';
import { QueueTab } from '../../domain/workflow.enums';

export interface ListWorkflowQueueCommand {
  access: UserAccessContext;
  tab: QueueTab;
  keyword?: string;
  type?: DeclarationType;
  status?: DeclarationStatus;
  checkpoint?: CheckpointCode;
  /** Khoảng ngày hồ sơ vào hàng đợi (F20) — cắt theo ngày giờ VN ở tầng dữ liệu. */
  from?: Date | string;
  to?: Date | string;
  page?: number;
  pageSize?: number;
}
