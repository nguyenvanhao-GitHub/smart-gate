import { DeclarationStatus, DeclarationType } from '../../../declarations/domain/declaration.enums';
import { DispatchAssignment } from '../../domain/dispatch-assignment.entity';

export const DISPATCH_ASSIGNMENT_REPOSITORY = Symbol('DISPATCH_ASSIGNMENT_REPOSITORY');

/** Ràng buộc duy nhất nào bị đụng ở tầng database. */
export type DispatchConflictScope =
  /** Xe/hồ sơ đã có một vị trí đang hiệu lực. */
  | 'DOSSIER'
  /** Ô đỗ đã có xe khác. */
  | 'SLOT';

export class DispatchAssignmentConflictError extends Error {
  constructor(public readonly scope: DispatchConflictScope) {
    super(`Ràng buộc duy nhất của vị trí điều phối bị đụng: ${scope}`);
    this.name = 'DispatchAssignmentConflictError';
  }
}

/** Vị trí kèm thông tin hồ sơ để hiển thị trên sơ đồ bãi. */
export interface DispatchAssignmentWithDossier {
  assignment: DispatchAssignment;
  dossierCode: string;
  plateNumber: string;
  enterpriseName: string;
}

export interface DispatchBoardCriteria {
  checkpoint?: string;
  /** `YYYY-MM-DD` — ngày làm việc dùng để hiển thị số thứ tự hàng đợi. */
  date: string;
  /** Lọc `declarations.createdAt` từ đầu ngày Việt Nam. */
  from?: Date;
  /** Lọc `declarations.createdAt` đến hết ngày Việt Nam. */
  to?: Date;
  search?: string;
  unrestricted: boolean;
  ownerUserId?: string;
  taxCodes?: string[];
}

/** Một thẻ phương tiện trên bảng điều phối (UI-08). */
export interface DispatchBoardRow {
  dossierId: string;
  dossierCode: string;
  plateNumber: string;
  enterpriseName: string;
  dossierStatus: DeclarationStatus;
  /** Loại hồ sơ — dùng để chặn gán cổng ngược chiều luồng (nhập→ENTRY, xuất→EXIT). */
  dossierType: DeclarationType;
  ticketNumber: number | null;
  ticketIssuedDate?: string | null;
  /** Mốc bắt đầu chờ: giờ cấp số, không có thì lấy giờ gửi hồ sơ. */
  waitingSince: Date;
  /** Mã bước hiện tại của phiên xử lý liên ngành; null khi hồ sơ chưa có phiên. */
  currentStepCode: string | null;
  /**
   * CR41 — **các bước đang mở** của phiên (trạng thái `IN_PROGRESS`/`WAITING_SUPPLEMENT`), sắp theo
   * thứ tự lộ trình. Use-case suy **giai đoạn hiện hành** từ tập này (`currentStageFromOpenSteps`) để
   * xếp hồ sơ vào đúng khung: cổng vào → Chờ điều phối, cụm nghiệp vụ → Đang kiểm tra, thu phí/cổng ra
   * → Đã kiểm tra xong. Rỗng nghĩa là phiên chưa mở hoặc đã đóng → hồ sơ không lên bảng điều phối.
   */
  activeStepCodes: string[];
  assignment: DispatchAssignment | null;
}

export interface DispatchAssignmentRepository {
  /** Ghi vị trí mới. **Ném `DispatchAssignmentConflictError`** khi đụng chỉ mục duy nhất. */
  insert(assignment: DispatchAssignment): Promise<DispatchAssignment>;
  /** Cập nhật vị trí (chuyển chỗ hoặc giải phóng). Cũng ném `DispatchAssignmentConflictError`. */
  update(assignment: DispatchAssignment): Promise<DispatchAssignment>;
  findById(id: string): Promise<DispatchAssignment | null>;
  findActiveByDossier(dossierId: string): Promise<DispatchAssignment | null>;
  findActiveBySlot(yardId: string, slotCode: string): Promise<DispatchAssignment | null>;
  findActiveByYard(yardId: string): Promise<DispatchAssignmentWithDossier[]>;
  /** Số ô đang có xe theo từng khu — khoá là `yardId`. */
  countOccupiedByYard(): Promise<Map<string, number>>;
  /**
   * Số ô **quá hạn lưu bãi** theo từng khu — xe còn đang đỗ (`ACTIVE`, có ô) và vào bãi trước
   * `overdueBefore` (= now − giờ lưu tối đa). Khoá là `yardId`.
   */
  countOverdueByYard(overdueBefore: Date): Promise<Map<string, number>>;
  findBoard(criteria: DispatchBoardCriteria): Promise<DispatchBoardRow[]>;
}
