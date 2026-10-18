import { PaginatedResult } from '../../../../common/http/pagination';
import { Declaration } from '../../domain/declaration.entity';
import { CheckpointCode, DeclarationStatus, DeclarationType } from '../../domain/declaration.enums';

export const DECLARATION_REPOSITORY = Symbol('DECLARATION_REPOSITORY');

/**
 * Điều kiện thu hẹp theo phạm vi dữ liệu của người dùng. Giữ ở dạng tối giản để tầng
 * persistence của `declarations` không phụ thuộc trực tiếp vào `DataScopeService`.
 */
export interface DeclarationScopeCriteria {
  /** True thì **không** ràng buộc theo doanh nghiệp/người tạo (phạm vi ALL, hoặc lãnh đạo/lực lượng). */
  unrestricted: boolean;
  /** Tài khoản đang gọi — chỉ dùng khi tài khoản **không** gắn doanh nghiệp nào. */
  ownerUserId?: string;
  /**
   * Mã số thuế doanh nghiệp mà người dùng được phân công. Có giá trị thì phạm vi `OWN` được siết
   * theo **doanh nghiệp** (bảng `enterprises`), không còn nới thêm theo `createdById`.
   */
  taxCodes?: string[];
  /** CCCD / Số giấy tờ cá nhân của người dùng. */
  idNumbers?: string[];
  /**
   * Chiều ràng buộc theo **tiến trình liên ngành** cho cán bộ lực lượng (`ORGANIZATION`/`ASSIGNMENT`):
   * chỉ thấy hồ sơ mà phiên xử lý đã **chạm tới hoặc đã đi qua** một trong các mã bước này (hợp các
   * bước của mọi vai trò của cán bộ). Vuông góc với chiều doanh nghiệp — vì thế đi kèm `unrestricted:
   * true`. Có giá trị thì tầng lưu trữ áp điều kiện `EXISTS` trên `workflow_instance_steps`.
   */
  reachedStepCodes?: string[];
  /** True thì loại trừ hồ sơ bản nháp (DRAFT) khỏi danh sách hiển thị đối với các vai trò nội bộ/điều phối. */
  excludeDraft?: boolean;
  /**
   * Yêu cầu hồ sơ đã vào quy trình liên ngành (đã có phiên `workflow_instances`).
   * Dành cho các vai trò điều hành/kho bãi (DISPATCHER, YARD_MANAGER) khi ở phạm vi ORGANIZATION/ASSIGNMENT:
   * chỉ thấy hồ sơ đã vào cửa khẩu, ẩn các hồ sơ mới nộp trực tuyến chưa tới lượt điều phối.
   */
  requireWorkflow?: boolean;
}

export interface DeclarationSearchCriteria {
  type?: DeclarationType;
  status?: DeclarationStatus;
  /**
   * Lọc theo **nhóm trạng thái** → `status IN (...)`. Áp song song với `status` (một hồ sơ khớp
   * khi thỏa cả hai điều kiện có mặt). Dùng chung hằng `IN_PROGRESS_STATUSES` để KPI "Đang xử lý"
   * đếm bằng đúng bộ lọc mà danh sách hồ sơ nhận qua drilldown.
   */
  statuses?: DeclarationStatus[];
  checkpoint?: CheckpointCode;
  /** CR2 — chỉ hồ sơ có cờ ưu tiên kiểm dịch (dịch tễ). Bỏ trống thì không ràng buộc theo cờ. */
  epidemic?: boolean;
  /** Lọc theo chuỗi ký tự trong mã hồ sơ (declaration.code ILIKE :code). */
  code?: string;
  keyword?: string;
  fromDate?: Date;
  toDate?: Date;
  taxCode?: string;
  scope?: DeclarationScopeCriteria;
}

export interface DeclarationPageCriteria extends DeclarationSearchCriteria {
  page?: number;
  pageSize?: number;
}

export interface ActiveDossierConflict {
  field: 'plateNumber' | 'driverIdNumber';
  value: string;
  vehicleIndex: number;
  dossierId: string;
  dossierCode: string;
}

export interface DeclarationRepository {
  nextCode(type: DeclarationType): Promise<string>;
  /** Danh sách không phân trang (giới hạn cứng) — dùng cho dashboard, phí, báo cáo nội bộ. */
  findMany(criteria: DeclarationSearchCriteria): Promise<Declaration[]>;
  /** Danh sách có phân trang cho màn hình hồ sơ UI-03. */
  findPage(criteria: DeclarationPageCriteria): Promise<PaginatedResult<Declaration>>;
  /**
   * Đếm hồ sơ khớp đúng bộ điều kiện của danh sách. Phải cho ra **cùng con số** với `total` của
   * `findPage` trên cùng `criteria` — dashboard dựa vào đó để KPI khớp danh sách nguồn (mốc M3).
   */
  count(criteria: DeclarationSearchCriteria): Promise<number>;
  findById(id: string): Promise<Declaration | null>;
  /** Tra cứu theo **mã hồ sơ** — màn hình cổng nhập tay mã thay cho quét QR (điểm C2 chưa chốt). */
  findByCode(code: string): Promise<Declaration | null>;
  /**
   * Ghi hồ sơ.
   */
  save(declaration: Declaration): Promise<Declaration>;
  delete(id: string): Promise<void>;
  /**
   * SG-115: Kiểm tra biển số xe hoặc số CCCD lái xe có đang nằm trong hồ sơ nào chưa kết thúc không.
   */
  findActiveConflicts(
    vehicles: { plateNumber?: string; driverIdNumber?: string }[],
    excludeDossierId?: string,
  ): Promise<ActiveDossierConflict[]>;
}
