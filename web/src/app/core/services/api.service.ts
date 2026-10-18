import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  DossierAttachment,
  DossierDetail,
  DossierDraftPayload,
  DossierFilters,
  DossierSubmitResult,
  DossierSummary,
  DocumentTypeOption,
  RequiredDocument,
} from '../models/declaration.model';
import { AccessProfile, DataScope } from '../auth/access-control.model';
import { DashboardFilters, DashboardOverview } from '../models/dashboard.model';
import { ReportDefinition, ReportQuery, ReportResult } from '../models/report.model';
import {
  CallNextDispatchPayload,
  CallNextDispatchResult,
  DispatchAssignment,
  DispatchAssignmentPatch,
  DispatchAssignmentPayload,
  DispatchBoard,
  DispatchBoardFilters,
  DispatchHistoryEntry,
  DispatchHistoryFilters,
  GateCatalogItem,
  GateDirection,
  LaneCatalogItem,
  QueueTicket,
} from '../models/dispatch.model';
import {
  CreateFeeRulePayload,
  DossierFeeResult,
  DossierFeeSummary,
  CollectFeePayload,
  FeeAdjustPayload,
  FeeRule,
  FeeRuleFilters,
  FeeRuleVersion,
  FeeTransaction,
  UpdateFeeRulePayload,
} from '../models/fees.model';
import { GateEvent, GateEventFilters, GateEventPayload, GateLookupResult, GateSummary } from '../models/gate.model';
import { YardDetail, YardSummary, YardZone, YardZoneUpdatePayload } from '../models/yard.model';
import {
  AuditLogFilters,
  AuditLogRow,
  CatalogItem,
  CatalogItemPayload,
  CatalogType,
  CatalogTypePayload,
  DossierFieldConfig,
  Paginated,
  SystemSetting,
  SystemSettingUpdate,
} from '../models/admin.model';
import {
  QueueItem,
  ReasonCode,
  ReasonCodeScope,
  WorkflowDecisionPayload,
  WorkflowDossierView,
  WorkflowInstance,
  WorkflowQueueFilters,
} from '../models/workflow.model';

const API_BASE_URL = environment.apiBaseUrl;

/** Mọi endpoint danh sách đều trả về khung phân trang này (page bắt đầu từ 1). */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  stats?: Record<string, number>;
}

/*
 * ⚠️ `SmartGateDashboard` và `getDashboard()` (`GET /smart-gate/dashboard`) đã **gỡ ở P5**.
 * Đó là dashboard mẫu tĩnh, không truy ngược được về danh sách nguồn nên không đạt DoD mốc
 * M3. Thay bằng `getDashboardOverview()` (`GET /dashboard/overview`) — mỗi KPI mang sẵn
 * `drilldown`. Đừng dựng lại lối cũ.
 */

export interface GateEvaluation {
  gate: string;
  canOpen: boolean;
  statusColor: 'GREEN' | 'YELLOW' | 'RED';
  blockingReasons: string[];
  requiredCompletedSteps: string[];
}

/** Cấu hình một màn thu phí — chỉ mã, nhãn do web tra từ `slug`/`force`. */
export interface FeeScreenConfig {
  slug: string;
  force: string;
  searchFields: string[];
  actions: string[];
}

/** Trạng thái tài khoản. `PENDING` là tài khoản tự đăng ký (F00) chờ admin duyệt. */
export type UserStatus = 'ACTIVE' | 'LOCKED' | 'PENDING';

/** Người dùng trả về ngay sau khi đăng nhập — thông tin đầy đủ lấy ở `/access-control/me`. */
export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  title?: string;
  status?: UserStatus;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
  refreshExpiresIn?: number;
  user: AuthenticatedUser;
}

export interface RefreshTokenResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
  refreshExpiresIn?: number;
  user?: AuthenticatedUser;
}

/** Loại tài khoản tự đăng ký (F00) — mã ASCII tập đóng theo SRS UI-01. */
export type AccountType = 'ENTERPRISE' | 'INDIVIDUAL';

/**
 * F00 — thân yêu cầu đăng ký tự phục vụ. `accountType` quyết định trường định danh bắt buộc kèm theo:
 * doanh nghiệp gửi `taxCode` (mã số thuế), cá nhân gửi `idNumber` (CCCD/hộ chiếu).
 */
export interface RegisterPayload {
  accountType: AccountType;
  username: string;
  password: string;
  /** Tên doanh nghiệp (DN) hoặc họ tên (cá nhân). */
  displayName: string;
  email: string;
  phone: string;
  /** Địa chỉ liên hệ — bắt buộc với cả doanh nghiệp lẫn cá nhân. */
  address: string;
  taxCode?: string;
  /** Người đại diện — chỉ tài khoản doanh nghiệp gửi. */
  representativeName?: string;
  idNumber?: string;
}

// --- Quản trị phân quyền -----------------------------------------------------

export interface PermissionDefinition {
  code: string;
  module: string;
  moduleLabel: string;
  action: string;
  actionLabel: string;
  name: string;
  sortOrder: number;
}

export interface RoleSummary {
  id: string;
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  isActive: boolean;
  userCount: number;
}

export interface Organization {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
  status: string;
}

export interface AdminUserRole {
  code: string;
  name: string;
  dataScope: DataScope;
}

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  title: string;
  email: string;
  phone: string;
  status: UserStatus;
  avatarUrl?: string | null;
  /** Cờ bảo vệ tài khoản Quản trị tối cao khỏi bị gỡ vai trò Quản trị hoặc xóa/khóa tài khoản. */
  isProtected?: boolean;
  /** Loại tài khoản tự đăng ký (F00): DN/cá nhân; `null` với tài khoản nội bộ do admin tạo. */
  accountType?: AccountType | null;
  /** Mã số thuế — chỉ tài khoản doanh nghiệp mới có. */
  taxCode?: string | null;
  /** Số CCCD/hộ chiếu — chỉ tài khoản cá nhân mới có. */
  idNumber?: string | null;
  /** Địa chỉ liên hệ — tài khoản DN/cá nhân; `null` với tài khoản nội bộ. */
  address?: string | null;
  /** Người đại diện — chỉ tài khoản doanh nghiệp mới có. */
  representativeName?: string | null;
  organization: { id: string; code: string; name: string } | null;
  roles: AdminUserRole[];
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserListFilters {
  role?: string;
  status?: string;
  keyword?: string;
  organizationId?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateUserPayload {
  username: string;
  password: string;
  displayName: string;
  title: string;
  email?: string;
  /** `null` xóa số điện thoại hiện tại khi cập nhật; bỏ trống vẫn hợp lệ. */
  phone?: string | null;
  organizationId?: string;
  /** Loại tài khoản: DN/cá nhân; bỏ trống = tài khoản nội bộ. */
  accountType?: AccountType;
  taxCode?: string;
  /** Người đại diện — chỉ gửi với tài khoản doanh nghiệp. */
  representativeName?: string;
  idNumber?: string;
  address?: string;
}

export type UpdateUserPayload = Partial<Omit<CreateUserPayload, 'username' | 'password'>>;

// --- Thông báo (F06) ---------------------------------------------------------

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  content: string;
  dossierCode: string | null;
  route: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage extends Paged<NotificationItem> {
  unreadCount: number;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private readonly http: HttpClient) {}

  // --- Xác thực --------------------------------------------------------------

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${API_BASE_URL}/auth/login`, { username, password });
  }

  refreshToken(refreshToken: string): Observable<RefreshTokenResponse> {
    return this.http.post<RefreshTokenResponse>(`${API_BASE_URL}/auth/refresh`, { refreshToken });
  }

  /**
   * F00 — Đăng ký tự phục vụ. Tài khoản tạo ra ở trạng thái chờ duyệt (`PENDING`) nên **không** trả
   * token; người dùng chỉ đăng nhập được sau khi admin duyệt. Trùng tài khoản/email/điện thoại → 409.
   */
  register(payload: RegisterPayload): Observable<{ registered: true }> {
    return this.http.post<{ registered: true }>(`${API_BASE_URL}/auth/register`, payload);
  }

  /** Gửi yêu cầu cấp lại mật khẩu qua email (SG-140) */
  forgotPassword(email: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${API_BASE_URL}/auth/forgot-password`, { email });
  }

  /** Hồ sơ truy cập: người dùng, vai trò, quyền, phân công và menu. */
  getAccessProfile(): Observable<AccessProfile> {
    return this.http.get<AccessProfile>(`${API_BASE_URL}/access-control/me`);
  }

  // --- Danh mục quyền và vai trò --------------------------------------------

  getPermissionCatalog(): Observable<PermissionDefinition[]> {
    return this.http.get<PermissionDefinition[]>(`${API_BASE_URL}/access-control/permissions`);
  }

  getRoles(): Observable<RoleSummary[]> {
    return this.http.get<RoleSummary[]>(`${API_BASE_URL}/access-control/roles`);
  }

  createRole(payload: { code: string; name: string; description: string }): Observable<RoleSummary> {
    return this.http.post<RoleSummary>(`${API_BASE_URL}/access-control/roles`, payload);
  }

  updateRole(id: string, payload: { name?: string; description?: string }): Observable<RoleSummary> {
    return this.http.patch<RoleSummary>(`${API_BASE_URL}/access-control/roles/${id}`, payload);
  }

  deleteRole(id: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/access-control/roles/${id}`);
  }

  lockRole(id: string): Observable<RoleSummary> {
    return this.http.post<RoleSummary>(`${API_BASE_URL}/access-control/roles/${id}/lock`, {});
  }

  unlockRole(id: string): Observable<RoleSummary> {
    return this.http.post<RoleSummary>(`${API_BASE_URL}/access-control/roles/${id}/unlock`, {});
  }

  getRolePermissions(id: string): Observable<string[]> {
    return this.http.get<string[]>(`${API_BASE_URL}/access-control/roles/${id}/permissions`);
  }

  setRolePermissions(id: string, permissions: string[]): Observable<void> {
    return this.http.put<void>(`${API_BASE_URL}/access-control/roles/${id}/permissions`, { permissions });
  }

  getOrganizations(): Observable<Organization[]> {
    return this.http.get<Organization[]>(`${API_BASE_URL}/organizations`);
  }

  // --- Người dùng ------------------------------------------------------------

  lookupUser(query: { taxCode?: string; idNumber?: string; email?: string; accountType?: string }): Observable<AdminUser | null> {
    return this.http.get<AdminUser | null>(`${API_BASE_URL}/users/lookup`, { params: this.toParams(query) });
  }

  getUsers(filters: UserListFilters = {}): Observable<Paged<AdminUser>> {
    return this.http.get<Paged<AdminUser>>(`${API_BASE_URL}/users`, { params: this.toParams(filters) });
  }

  createUser(payload: CreateUserPayload): Observable<AdminUser> {
    return this.http.post<AdminUser>(`${API_BASE_URL}/users`, payload);
  }

  updateUser(id: string, payload: UpdateUserPayload): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`${API_BASE_URL}/users/${id}`, payload);
  }

  deleteUser(id: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/users/${id}`);
  }

  resetUserPassword(id: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/users/${id}/actions/reset-password`, { newPassword });
  }

  lockUser(id: string, reason: string): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/users/${id}/actions/lock`, { reason });
  }

  unlockUser(id: string): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/users/${id}/actions/unlock`, {});
  }

  /** F00 — duyệt tài khoản tự đăng ký (PENDING → ACTIVE). */
  approveUser(id: string): Observable<AdminUser> {
    return this.http.post<AdminUser>(`${API_BASE_URL}/users/${id}/actions/approve`, {});
  }

  setUserRoles(id: string, roles: Array<{ roleCode: string; dataScope: DataScope }>): Observable<void> {
    return this.http.put<void>(`${API_BASE_URL}/users/${id}/roles`, { roles });
  }

  setUserAssignments(id: string, assignments: Array<{ type: string; code: string }>): Observable<void> {
    return this.http.put<void>(`${API_BASE_URL}/users/${id}/assignments`, { assignments });
  }

  // --- Hồ sơ cá nhân (F01) ---------------------------------------------------

  updateProfile(payload: {
    displayName?: string;
    title?: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    representativeName?: string | null;
    idNumber?: string | null;
    avatarUrl?: string | null;
  }): Observable<void> {
    return this.http.patch<void>(`${API_BASE_URL}/profile`, payload);
  }

  changePassword(payload: { currentPassword: string; newPassword: string }): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/profile/actions/change-password`, payload);
  }

  // --- Thông báo (F06) -------------------------------------------------------

  getNotifications(filters: { unreadOnly?: boolean; page?: number; pageSize?: number } = {}): Observable<NotificationPage> {
    return this.http.get<NotificationPage>(`${API_BASE_URL}/notifications`, { params: this.toParams(filters) });
  }

  getUnreadNotificationCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${API_BASE_URL}/notifications/unread-count`);
  }

  markNotificationRead(id: string): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/notifications/${id}/actions/read`, {});
  }

  markAllNotificationsRead(): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/notifications/actions/read-all`, {});
  }

  // --- Hồ sơ điện tử (F07–F17) -----------------------------------------------

  /** UI-03 — danh sách hồ sơ có tìm kiếm, lọc và phân trang phía máy chủ. */
  getDeclarations(filters: DossierFilters = {}): Observable<Paged<DossierSummary>> {
    return this.http.get<Paged<DossierSummary>>(`${API_BASE_URL}/declarations`, { params: this.toParams(filters) });
  }

  getDeclaration(id: string): Observable<DossierDetail> {
    return this.http.get<DossierDetail>(`${API_BASE_URL}/declarations/${id}`);
  }

  /** Tạo hồ sơ nháp (F07). */
  createDeclaration(payload: DossierDraftPayload): Observable<DossierDetail> {
    return this.http.post<DossierDetail>(`${API_BASE_URL}/declarations`, payload);
  }

  /** Cập nhật hồ sơ nháp — API chỉ cho sửa khi trạng thái còn cho phép (F15). */
  updateDeclaration(id: string, payload: Partial<DossierDraftPayload>): Observable<DossierDetail> {
    return this.http.patch<DossierDetail>(`${API_BASE_URL}/declarations/${id}`, payload);
  }

  deleteDeclaration(id: string): Observable<{ deleted: true }> {
    return this.http.delete<{ deleted: true }>(`${API_BASE_URL}/declarations/${id}`);
  }

  /** CR3 — Sao chép hồ sơ (kèm tệp đính kèm) sang một bản nháp mới; trả chi tiết bản mới để mở màn sửa. */
  copyDeclaration(id: string): Observable<DossierDetail> {
    return this.http.post<DossierDetail>(`${API_BASE_URL}/declarations/${id}/copy`, {});
  }

  /** Gửi hồ sơ — thành công trả mã hồ sơ và chuỗi QR (F14); thiếu dữ liệu trả 400 kèm `errors[]`. */
  submitDeclaration(id: string): Observable<DossierSubmitResult> {
    return this.http.post<DossierSubmitResult>(`${API_BASE_URL}/declarations/${id}/actions/submit`, {});
  }

  /** Gắn tệp đã tải lên vào hồ sơ. */
  attachDeclarationFiles(id: string, attachmentIds: string[]): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/declarations/${id}/attachments`, { attachmentIds });
  }

  removeDeclarationAttachment(id: string, attachmentId: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/declarations/${id}/attachments/${attachmentId}`);
  }

  cancelDeclaration(id: string, payload: { note?: string }): Observable<{ cancelled: true }> {
    return this.http.post<{ cancelled: true }>(`${API_BASE_URL}/declarations/${id}/actions/cancel`, payload);
  }

  /*
   * ⚠️ `confirmDeclaration()` và `requestDeclarationRevision()` đã **gỡ ở P3** cùng hai endpoint
   * `POST /declarations/:id/actions/confirm` và `.../request-revision`. Mọi quyết định liên ngành
   * đi qua `decideWorkflowDossier()` — nơi API chặn sai thứ tự bước (409) và bắt buộc mã nguyên
   * nhân (400). Đừng dựng lại hai lối tắt này.
   */

  // --- Tệp đính kèm (F11) ----------------------------------------------------

  /**
   * Tải tệp lên. Gửi `multipart/form-data` với trường `file`; **không** tự đặt
   * `Content-Type` để trình duyệt tự sinh boundary.
   */
  uploadFile(file: File, options: { dossierId?: string; documentTypeCode?: string } = {}): Observable<DossierAttachment> {
    const form = new FormData();
    form.append('file', file, file.name);
    if (options.dossierId) form.append('dossierId', options.dossierId);
    if (options.documentTypeCode) form.append('documentTypeCode', options.documentTypeCode);
    return this.http.post<DossierAttachment>(`${API_BASE_URL}/files`, form);
  }

  downloadFile(id: string): Observable<Blob> {
    return this.http.get(`${API_BASE_URL}/files/${id}`, { responseType: 'blob' });
  }

  cancelDownloadFile(id: string): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/files/${id}/cancel-download`, {});
  }

  getFileMetadata(id: string): Observable<DossierAttachment> {
    return this.http.get<DossierAttachment>(`${API_BASE_URL}/files/${id}/metadata`);
  }

  deleteFile(id: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/files/${id}`);
  }

  // --- Liên ngành: hàng đợi và xử lý nghiệp vụ (F18–F26) ---------------------

  /**
   * UI-06 — hàng đợi theo tab `todo | done | waiting`.
   * Mỗi dòng kèm `elapsedSecondsInStep` (thời gian ĐÃ trôi qua ở bước hiện tại).
   * Không có trường SLA nào: SRS không định nghĩa ngưỡng (điểm D1).
   */
  getWorkflowQueue(filters: WorkflowQueueFilters = {}): Observable<Paged<QueueItem>> {
    return this.http.get<Paged<QueueItem>>(`${API_BASE_URL}/workflow/queue`, { params: this.toParams(filters) });
  }

  /** UI-07 — hồ sơ kèm tiến trình, checklist và danh sách quyết định khả dụng. */
  getWorkflowDossier(id: string): Observable<WorkflowDossierView> {
    return this.http.get<WorkflowDossierView>(`${API_BASE_URL}/workflow/dossiers/${id}`);
  }

  /**
   * Ghi quyết định cho bước hiện tại (F22–F24).
   * API trả 409 khi thao tác sai thứ tự bước và 400 khi thiếu mã lý do — màn hình
   * phải hiển thị rõ, không được nuốt lỗi.
   */
  decideWorkflowDossier(id: string, payload: WorkflowDecisionPayload): Observable<{ instance: WorkflowInstance }> {
    return this.http.post<{ instance: WorkflowInstance }>(`${API_BASE_URL}/workflow/dossiers/${id}/actions/decide`, payload);
  }


  // --- Danh mục dùng chung (F04) ---------------------------------------------

  /** Mã nguyên nhân bắt buộc khi yêu cầu bổ sung / từ chối / thu hồi / điều chỉnh phí. */
  getReasonCodes(scope: ReasonCodeScope): Observable<ReasonCode[]> {
    return this.http.get<ReasonCode[]>(`${API_BASE_URL}/catalog/reason-codes`, { params: this.toParams({ scope }) });
  }

  /** Danh mục cổng — dùng cho gán vị trí (UI-08) và chọn cổng ghi nhận sự kiện (UI-09). */
  getGateCatalog(): Observable<GateCatalogItem[]> {
    return this.http.get<GateCatalogItem[]>(`${API_BASE_URL}/catalog/gates`);
  }

  /** Danh mục làn; lọc theo cổng ở phía web bằng trường `gateCode`. */
  getLaneCatalog(): Observable<LaneCatalogItem[]> {
    return this.http.get<LaneCatalogItem[]>(`${API_BASE_URL}/catalog/lanes`);
  }

  /** Chứng từ bắt buộc theo loại hồ sơ (D7 / F13) — dùng để đánh dấu đã đủ / còn thiếu ở UI-04/UI-05. */
  getRequiredDocuments(dossierType: string): Observable<RequiredDocument[]> {
    return this.http.get<RequiredDocument[]>(`${API_BASE_URL}/catalog/required-documents`, {
      params: this.toParams({ dossierType }),
    });
  }

  /** Danh mục loại chứng từ (F04) — web đổ vào ô chọn khi đính kèm tệp thay cho danh sách cứng. */
  getDocumentTypes(): Observable<DocumentTypeOption[]> {
    return this.http.get<DocumentTypeOption[]>(`${API_BASE_URL}/catalog/document-types`);
  }

  // --- Số thứ tự hàng đợi (F27) ----------------------------------------------

  /** Cấp số thứ tự cho hồ sơ — gắn một số duy nhất theo (ngày, luồng), idempotent trong ngày. */
  createQueueTicket(dossierId: string): Observable<QueueTicket> {
    return this.http.post<QueueTicket>(`${API_BASE_URL}/queue-tickets`, { dossierId });
  }

  // --- Điều phối phương tiện (F29, F31 — UI-08) ------------------------------

  /**
   * UI-08 — KPI tải và **bảng điều phối dạng cột**. Cột do API trả trong `columns`,
   * web không tự chia nhóm. Không có dữ liệu ETA hay cảnh báo ùn tắc (điểm D1).
   */
  getDispatchBoard(filters: DispatchBoardFilters = {}): Observable<DispatchBoard> {
    return this.http.get<DispatchBoard>(`${API_BASE_URL}/dispatch/board`, { params: this.toParams(filters) });
  }

  /**
   * Lịch sử gán/chuyển/bỏ vị trí điều phối (F33). Tra theo hồ sơ, khoảng thời gian và cán bộ;
   * mới nhất trước, phân trang server-side.
   */
  getDispatchHistory(filters: DispatchHistoryFilters = {}): Observable<Paged<DispatchHistoryEntry>> {
    return this.http.get<Paged<DispatchHistoryEntry>>(`${API_BASE_URL}/dispatch/history`, { params: this.toParams(filters) });
  }

  /**
   * Gán cổng/làn/bãi/ô cho một phương tiện.
   * API trả **409 khi vị trí đã có xe khác** (1 vị trí = 1 xe) — màn hình phải hiện
   * nguyên thông báo, không được nuốt lỗi.
   */
  createDispatchAssignment(payload: DispatchAssignmentPayload): Observable<DispatchAssignment> {
    return this.http.post<DispatchAssignment>(`${API_BASE_URL}/dispatch/assignments`, payload);
  }

  updateDispatchAssignment(id: string, payload: DispatchAssignmentPatch): Observable<DispatchAssignment> {
    return this.http.patch<DispatchAssignment>(`${API_BASE_URL}/dispatch/assignments/${id}`, payload);
  }

  /**
   * Chuyển trạng thái kiểm tra/tập kết của xe trong bãi (F44).
   * API trả **409 khi chuyển sai bước** (kèm `message`) — màn hình phải hiện nguyên thông báo,
   * không được nuốt lỗi.
   */
  updateAssignmentInspection(
    id: string,
    payload: { status: string; note?: string },
  ): Observable<{ assignment: DispatchAssignment }> {
    return this.http.post<{ assignment: DispatchAssignment }>(
      `${API_BASE_URL}/dispatch/assignments/${id}/actions/inspection`,
      payload,
    );
  }

  deleteDispatchAssignment(id: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/dispatch/assignments/${id}`);
  }

  /**
   * Gọi số tiếp theo vào kiểm tra chuyên ngành (UI-08 · SG-60).
   * Lấy số thứ tự nhỏ nhất trong hàng đợi chờ gọi và chuyển hồ sơ sang BUSINESS_PROCESSING.
   */
  callNextDispatch(payload: CallNextDispatchPayload = {}): Observable<CallNextDispatchResult> {
    return this.http.post<CallNextDispatchResult>(`${API_BASE_URL}/dispatch/call-next`, payload);
  }

  // --- Kho bãi (F42–F44 — UI-10) ---------------------------------------------

  getYards(): Observable<YardSummary[]> {
    return this.http.get<YardSummary[]>(`${API_BASE_URL}/yards`);
  }

  /** Chi tiết bãi kèm toàn bộ ô đỗ và xe đang chiếm chỗ. */
  getYard(id: string): Observable<YardDetail> {
    return this.http.get<YardDetail>(`${API_BASE_URL}/yards/${id}`);
  }

  /** Giải phóng ô đỗ khi xe rời bãi (F44). */
  releaseYardSlot(yardId: string, slotCode: string): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/yards/${yardId}/slots/${encodeURIComponent(slotCode)}/actions/release`, {});
  }

  /**
   * Khoá ô đỗ để bảo trì (F42). API trả **409 khi ô đang có xe** (kèm `message`) — màn hình phải
   * hiện nguyên thông báo. Trả về sơ đồ khu sau khi khoá.
   */
  lockYardSlot(yardId: string, slotCode: string): Observable<YardDetail> {
    return this.http.post<YardDetail>(`${API_BASE_URL}/yards/${yardId}/slots/${encodeURIComponent(slotCode)}/actions/lock`, {});
  }

  /** Mở lại ô đỗ đang khoá (F42). Trả về sơ đồ khu sau khi mở. */
  unlockYardSlot(yardId: string, slotCode: string): Observable<YardDetail> {
    return this.http.post<YardDetail>(`${API_BASE_URL}/yards/${yardId}/slots/${encodeURIComponent(slotCode)}/actions/unlock`, {});
  }

  // --- Cấu hình bãi và sức chứa (F42 — UI-11) --------------------------------

  /** Danh sách khu bãi kèm sức chứa công bố và số ô đang có xe (F42). */
  getYardZones(): Observable<YardZone[]> {
    return this.http.get<YardZone[]>(`${API_BASE_URL}/catalog/yard-zones`);
  }

  /** Cập nhật tên / sức chứa của một khu bãi (F42 — cần quyền `catalog.update`). */
  updateYardZone(code: string, payload: YardZoneUpdatePayload): Observable<YardZone> {
    return this.http.patch<YardZone>(`${API_BASE_URL}/catalog/yard-zones/${encodeURIComponent(code)}`, payload);
  }

  // --- Kiểm soát cổng (F38, F39 — UI-09) -------------------------------------

  /**
   * Tra cứu hồ sơ theo mã tại cổng — kèm đánh giá điều kiện và checklist.
   * Nhận `direction` ('ENTRY' | 'EXIT') của làn đang tra cứu để máy chủ đánh giá đúng chiều (F38, F39);
   * hoặc `options` `{ direction, gateCode }` nếu cần chỉ định mã cổng cụ thể.
   */
  lookupGateDossier(
    code: string,
    options?: { gateCode?: string; direction?: GateDirection } | GateDirection,
  ): Observable<GateLookupResult> {
    const params: Record<string, string | undefined> = { code };
    if (typeof options === 'string') {
      params['direction'] = options;
    } else if (options) {
      params['gateCode'] = options.gateCode;
      params['direction'] = options.direction;
    }
    return this.http.get<GateLookupResult>(`${API_BASE_URL}/gate/lookup`, { params: this.toParams(params) });
  }

  /**
   * Ghi nhận sự kiện cổng (F38). API trả **409 khi quyết định ALLOW mà `canOpen = false`**,
   * kèm `blockingReasons[]` — phải hiển thị nguyên danh sách điều kiện còn thiếu.
   */
  createGateEvent(payload: GateEventPayload): Observable<GateEvent> {
    return this.http.post<GateEvent>(`${API_BASE_URL}/gate/events`, payload);
  }

  getGateEvents(filters: GateEventFilters = {}): Observable<Paged<GateEvent>> {
    return this.http.get<Paged<GateEvent>>(`${API_BASE_URL}/gate/events`, { params: this.toParams(filters) });
  }

  /** KPI cổng trong ngày (UI-09): lượt cho qua / từ chối hôm nay, tùy chọn theo cổng. */
  getGateSummary(gateCode?: string): Observable<GateSummary> {
    return this.http.get<GateSummary>(`${API_BASE_URL}/gate/summary`, { params: this.toParams({ gateCode }) });
  }

  // --- Tác nghiệp / thu phí / báo cáo ----------------------------------------

  getFeeScreens(): Observable<FeeScreenConfig[]> {
    return this.http.get<FeeScreenConfig[]>(`${API_BASE_URL}/fees/screens`);
  }

  /** `action` là **mã hành động** (`FeeActionCode`), không phải nhãn tiếng Việt của nút. */
  runFeeAction(slug: string, action: string, payload: object): Observable<object> {
    return this.http.post<object>(`${API_BASE_URL}/fees/${slug}/actions/${action}`, payload);
  }

  getFeeItems(slug: string, filters: object = {}): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${API_BASE_URL}/fees/${slug}/items`, { params: this.toParams(filters) });
  }

  /**
   * Xuất đối soát phí — tệp CSV do **máy chủ** dựng từ số thật và ghi nhật ký, theo đúng bộ lọc đang
   * xem (BUG-028). Không tự sinh CSV ở trình duyệt nữa.
   */
  exportFeeItems(slug: string, filters: object = {}): Observable<Blob> {
    return this.http.get(`${API_BASE_URL}/fees/${slug}/export`, { params: this.toParams(filters), responseType: 'blob' });
  }

  // --- Thu phí theo hồ sơ (F46–F48, F51 — UI-11) -----------------------------

  /** Bảng kê phí của một hồ sơ kèm giao dịch thanh toán và số còn phải thu. */
  getDossierFees(id: string): Observable<DossierFeeSummary> {
    return this.http.get<DossierFeeSummary>(`${API_BASE_URL}/declarations/${id}/fees`);
  }

  /** Tính (hoặc tính lại) phí theo biểu phí hiện hành (F46). */
  calculateDossierFees(id: string): Observable<DossierFeeResult> {
    return this.http.post<DossierFeeResult>(`${API_BASE_URL}/declarations/${id}/fees/actions/calculate`, {});
  }

  /**
   * Điều chỉnh một khoản phí (F51). API trả **400 khi thiếu mã lý do** nhóm `REASON_FEE_ADJUST`
   * — web chặn trước để không bắt người dùng bấm rồi mới nhận lỗi.
   */
  adjustDossierFee(id: string, payload: FeeAdjustPayload): Observable<DossierFeeResult> {
    return this.http.post<DossierFeeResult>(`${API_BASE_URL}/declarations/${id}/fees/actions/adjust`, payload);
  }

  /**
   * Thu phí **một nhịp** (endpoint thu phí duy nhất, F47 + F48 gộp): server ghi thẳng một giao dịch đã
   * xác nhận, không để lại `PENDING` treo. Chứng từ/biên lai đính kèm tải trước qua `uploadFile()` rồi
   * truyền `attachmentId`. Chỉ vai trò có quyền `fee.approve`.
   */
  collectFee(id: string, payload: CollectFeePayload): Observable<FeeTransaction> {
    return this.http.post<FeeTransaction>(`${API_BASE_URL}/declarations/${id}/fees/collect`, payload);
  }

  /** Biểu phí hiện hành — dùng để đối chiếu đơn giá khi điều chỉnh khoản phí. */
  getFeeRules(filters: FeeRuleFilters = {}): Observable<FeeRule[]> {
    return this.http.get<FeeRule[]>(`${API_BASE_URL}/catalog/fee-rules`, { params: this.toParams(filters) });
  }

  /** Mọi bản biểu phí (kể cả đã đóng / chưa tới) cho màn Quản trị biểu phí (F46) — quyền `fee.approve`. */
  getFeeRuleVersions(): Observable<FeeRuleVersion[]> {
    return this.http.get<FeeRuleVersion[]>(`${API_BASE_URL}/catalog/fee-rules/admin`);
  }

  /**
   * Thêm một bản biểu phí (F46). API **đóng bản đang chạy** rồi thêm bản mới có ngày hiệu lực sau —
   * không sửa số tiền của bản đã áp dụng. Trùng/sớm hơn ngày bản đang chạy trả 409.
   */
  createFeeRule(payload: CreateFeeRulePayload): Observable<FeeRuleVersion> {
    return this.http.post<FeeRuleVersion>(`${API_BASE_URL}/catalog/fee-rules`, payload);
  }

  /** Sửa một bản biểu phí (F46) — bản đã/đang áp dụng chỉ nhận metadata phi-tiền, sửa mức phí trả 409. */
  updateFeeRule(id: string, payload: UpdateFeeRulePayload): Observable<FeeRuleVersion> {
    return this.http.patch<FeeRuleVersion>(`${API_BASE_URL}/catalog/fee-rules/${id}`, payload);
  }

  // --- Báo cáo — thống kê (F51–F56, F58 — UI-12) -----------------------------

  /** Danh mục báo cáo kèm **định nghĩa bộ lọc** — web dựng biểu mẫu lọc từ đây, không hard-code. */
  getReportCatalog(): Observable<ReportDefinition[]> {
    return this.http.get<ReportDefinition[]>(`${API_BASE_URL}/reports/catalog`);
  }

  /** Chạy báo cáo. Cột, dòng và `drilldown` (danh sách nguồn) đều do API quyết định. */
  queryReport(code: string, filters: ReportQuery): Observable<ReportResult> {
    return this.http.post<ReportResult>(`${API_BASE_URL}/reports/${encodeURIComponent(code)}/query`, filters);
  }

  /**
   * Xuất Excel (F58) — **cùng thân yêu cầu với `queryReport`** để tệp tải về khớp
   * đúng bộ lọc đang xem. Chỉ có Excel; PDF không thuộc phạm vi MVP.
   */
  exportReport(code: string, filters: ReportQuery): Observable<Blob> {
    return this.http.post(`${API_BASE_URL}/reports/${encodeURIComponent(code)}/export`, filters, { responseType: 'blob' });
  }

  // --- Dashboard tổng quan (UI-02) -------------------------------------------

  /**
   * Số liệu tổng quan. Mỗi KPI kèm `drilldown { route, queryParams }` — bấm vào KPI
   * phải mở đúng danh sách sinh ra con số đó (DoD mốc M3), nên web **không tự suy ra
   * đường dẫn**. Không có dữ liệu bản đồ và không có cảnh báo SLA (điểm A0/D5).
   */
  getDashboardOverview(filters: DashboardFilters = {}): Observable<DashboardOverview> {
    return this.http.get<DashboardOverview>(`${API_BASE_URL}/dashboard/overview`, { params: this.toParams(filters) });
  }

  getGateEvaluation(id: string, gate?: string): Observable<GateEvaluation> {
    const options = gate ? { params: new HttpParams().set('gate', gate) } : {};
    return this.http.get<GateEvaluation>(`${API_BASE_URL}/smart-gate/declarations/${id}/gate-evaluation`, options);
  }

  // --- F04 Danh mục dùng chung ---
  getCatalogTypes(): Observable<CatalogType[]> {
    return this.http.get<CatalogType[]>(`${API_BASE_URL}/catalogs`);
  }

  createCatalogType(payload: CatalogTypePayload): Observable<CatalogType> {
    return this.http.post<CatalogType>(`${API_BASE_URL}/catalogs`, payload);
  }

  updateCatalogType(type: string, payload: Partial<CatalogTypePayload>): Observable<CatalogType> {
    return this.http.patch<CatalogType>(`${API_BASE_URL}/catalogs/${type}`, payload);
  }

  /** BUG-058: xóa nhóm danh mục (chỉ nhóm admin tự thêm & rỗng — BE kiểm rào, có thể trả 400). */
  deleteCatalogType(type: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/catalogs/${type}`);
  }

  getCatalogItems(type: string, filters: object = {}): Observable<Paginated<CatalogItem>> {
    return this.http.get<Paginated<CatalogItem>>(`${API_BASE_URL}/catalogs/${type}/items`, { params: this.toParams(filters) });
  }

  /** Danh mục loại hình hồ sơ (F04) từ CatalogsController (`typeCode = 'DOSSIER_TYPE'`). */
  getDossierTypes(): Observable<CatalogItem[]> {
    return this.getCatalogItems('DOSSIER_TYPE', { status: 'ACTIVE', pageSize: 100 }).pipe(
      map((res) => res?.items || []),
      catchError(() => of([])),
    );
  }

  /** Danh mục chốt / cổng cửa khẩu (F04) từ CatalogsController (`typeCode = 'BORDER_GATE'`). */
  getCheckpoints(): Observable<CatalogItem[]> {
    return this.getCatalogItems('BORDER_GATE', { status: 'ACTIVE', pageSize: 100 }).pipe(
      map((res) => res?.items || []),
      catchError(() => of([])),
    );
  }

  /** Danh mục loại phương tiện (F04) từ CatalogsController (`typeCode = 'VEHICLE_TYPE'`). */
  getVehicleTypes(): Observable<CatalogItem[]> {
    return this.getCatalogItems('VEHICLE_TYPE', { status: 'ACTIVE', pageSize: 100 }).pipe(
      map((res) => res?.items || []),
      catchError(() => of([])),
    );
  }

  /** Danh mục loại hàng hóa (F04) từ CatalogsController (`typeCode = 'CARGO_TYPE'`). */
  getCargoTypes(): Observable<CatalogItem[]> {
    return this.getCatalogItems('CARGO_TYPE', { status: 'ACTIVE', pageSize: 100 }).pipe(
      map((res) => res?.items || []),
      catchError(() => of([])),
    );
  }

  /** Danh mục đơn vị tính (F04) từ CatalogsController (`typeCode = 'UNIT'`). */
  getUnits(): Observable<CatalogItem[]> {
    return this.getCatalogItems('UNIT', { status: 'ACTIVE', pageSize: 100 }).pipe(
      map((res) => res?.items || []),
      catchError(() => of([])),
    );
  }

  /** Danh mục quốc gia / quốc tịch (F04) từ CatalogsController (`typeCode = 'COUNTRY'`). */
  getCountries(): Observable<CatalogItem[]> {
    return this.getCatalogItems('COUNTRY', { status: 'ACTIVE', pageSize: 100 }).pipe(
      map((res) => res?.items || []),
      catchError(() => of([])),
    );
  }

  createCatalogItem(type: string, payload: CatalogItemPayload): Observable<CatalogItem> {
    return this.http.post<CatalogItem>(`${API_BASE_URL}/catalogs/${type}/items`, payload);
  }

  updateCatalogItem(type: string, id: string, payload: Partial<CatalogItemPayload>): Observable<CatalogItem> {
    return this.http.patch<CatalogItem>(`${API_BASE_URL}/catalogs/${type}/items/${id}`, payload);
  }

  /** BUG-058: xóa mục danh mục (chỉ mục admin tự thêm & chưa dùng — BE kiểm rào, có thể trả 400). */
  deleteCatalogItem(type: string, id: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/catalogs/${type}/items/${id}`);
  }

  lockCatalogItem(type: string, id: string): Observable<CatalogItem> {
    return this.http.post<CatalogItem>(`${API_BASE_URL}/catalogs/${type}/items/${id}/actions/lock`, {});
  }

  unlockCatalogItem(type: string, id: string): Observable<CatalogItem> {
    return this.http.post<CatalogItem>(`${API_BASE_URL}/catalogs/${type}/items/${id}/actions/unlock`, {});
  }

  getDossierFieldConfigs(dossierType: string): Observable<DossierFieldConfig[]> {
    return this.http.get<DossierFieldConfig[]>(`${API_BASE_URL}/catalogs/dossier-types/${dossierType}/field-configs`).pipe(
      catchError(() => of([])),
    );
  }

  updateDossierFieldConfigs(dossierType: string, items: Array<{ fieldKey: string; sectionKey?: string; isVisible: boolean; isRequired: boolean }>): Observable<DossierFieldConfig[]> {
    return this.http.put<DossierFieldConfig[]>(`${API_BASE_URL}/catalogs/dossier-types/${dossierType}/field-configs`, { items });
  }

  // --- F05 Nhật ký thao tác ---
  getAuditLogs(filters: AuditLogFilters = {}): Observable<Paginated<AuditLogRow>> {
    return this.http.get<Paginated<AuditLogRow>>(`${API_BASE_URL}/audit-logs`, { params: this.toParams(filters) });
  }

  /**
   * Xuất nhật ký ra CSV theo **đúng bộ lọc đang xem** (F58) — tệp do máy chủ dựng và ghi nhật ký
   * `REPORT_EXPORT`, không còn báo "chưa khả dụng" (BUG-027).
   */
  exportAuditLogs(filters: AuditLogFilters = {}): Observable<Blob> {
    return this.http.get(`${API_BASE_URL}/audit-logs/export`, { params: this.toParams(filters), responseType: 'blob' });
  }

  /** SG-225: Ghi nhận kết quả xuất file từ client (thành công, hủy, hoặc thất bại) vào Nhật ký thao tác. */
  logExportResult(payload: {
    action?: string;
    targetType?: string;
    targetId?: string;
    result: 'SUCCESS' | 'CANCELLED' | 'FAILURE';
    reportName?: string;
    filter?: Record<string, unknown>;
  }): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${API_BASE_URL}/audit-logs/export-result`, payload);
  }

  // --- BA-092 Cấu hình hệ thống ---
  getSystemSettings(): Observable<SystemSetting[]> {
    return this.http.get<SystemSetting[]>(`${API_BASE_URL}/system/settings`);
  }

  /** Lưu một hoặc nhiều tham số cấu hình; trả về toàn bộ danh sách sau khi cập nhật. */
  updateSystemSettings(items: SystemSettingUpdate[]): Observable<SystemSetting[]> {
    return this.http.put<SystemSetting[]>(`${API_BASE_URL}/system/settings`, { items });
  }

  /** Bỏ qua tham số rỗng để không gửi query param thừa lên API. */
  private toParams(filters: object): HttpParams {
    let params = new HttpParams();
    Object.entries(filters as Record<string, string | number | boolean | undefined | null | string[]>).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '' || value === false) return;
      if (Array.isArray(value)) {
        if (value.length > 0) {
          params = params.set(key, value.join(','));
        }
        return;
      }
      params = params.set(key, String(value));
    });
    return params;
  }
}
