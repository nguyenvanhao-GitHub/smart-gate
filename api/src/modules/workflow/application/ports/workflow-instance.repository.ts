import { PaginatedResult } from '../../../../common/http/pagination';
import { CheckpointCode, DeclarationStatus, DeclarationType } from '../../../declarations/domain/declaration.enums';
import { AgencyAction } from '../../domain/agency-action.entity';
import { WorkflowInstance } from '../../domain/workflow-instance.entity';
import { QueueTab } from '../../domain/workflow.enums';

export const WORKFLOW_INSTANCE_REPOSITORY = Symbol('WORKFLOW_INSTANCE_REPOSITORY');

/** Phần dữ liệu hồ sơ mà hàng đợi cần — lấy kèm để không phải gọi thêm repository hồ sơ theo từng dòng. */
export interface QueueDossierRow {
  id: string;
  code: string;
  type: DeclarationType;
  status: DeclarationStatus;
  epidemicFlag: boolean;
  enterpriseTaxCode: string;
  enterpriseName: string;
  plateNumber: string;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
}

export interface WorkflowQueueRow {
  /**
   * Null với hồ sơ đã gửi nhưng **chưa từng có ai thao tác** — phiên chỉ được ghi xuống DB khi có
   * quyết định đầu tiên, nên hàng đợi phải tự suy ra bước đầu từ lộ trình.
   */
  instance: WorkflowInstance | null;
  dossier: QueueDossierRow;
}

export interface WorkflowQueueCriteria {
  tab: QueueTab;
  actorId: string;
  /** True nếu là tài khoản Admin (SYS_ADMIN / ADMIN / MANAGEMENT) */
  isAdmin?: boolean;
  /**
   * Các mã bước mà **vai trò của người đang đăng nhập** được xử lý — tầng application tính sẵn từ
   * lộ trình đọc trong DB, kho dữ liệu chỉ việc lọc. Rỗng thì tab "cần xử lý" không có gì.
   */
  actionableStepCodes: string[];
  /** Danh sách mã các bước kiểm tra nghiệp vụ (Biên phòng, Hải quan, Kiểm dịch) */
  inspectionStepCodes?: string[];
  /** Bước xử lý đầu tiên của mỗi luồng, dùng cho hồ sơ chưa có phiên trong DB. */
  defaultExportStepCode: string | null;
  defaultImportStepCode: string | null;
  /** True thì không siết phạm vi dữ liệu (vai trò phạm vi ALL). */
  unrestricted: boolean;
  ownerUserId?: string;
  taxCodes?: string[];
  keyword?: string;
  type?: DeclarationType;
  status?: DeclarationStatus;
  checkpoint?: CheckpointCode;
  /** Khoảng ngày hồ sơ vào hàng đợi (F20) — cắt theo ngày giờ VN ở tầng dữ liệu. */
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export interface WorkflowInstanceRepository {
  findByDossierId(dossierId: string): Promise<WorkflowInstance | null>;
  /** Ghi phiên và toàn bộ bước trong một giao dịch. */
  save(instance: WorkflowInstance): Promise<WorkflowInstance>;
  appendAction(action: AgencyAction): Promise<void>;
  findActionsByDossierId(dossierId: string): Promise<AgencyAction[]>;
  findQueue(criteria: WorkflowQueueCriteria): Promise<PaginatedResult<WorkflowQueueRow>>;
}
