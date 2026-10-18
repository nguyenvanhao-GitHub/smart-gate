export const USER_DIRECTORY = Symbol('USER_DIRECTORY');

/**
 * Thông tin tối thiểu về tài khoản mà phân hệ phân quyền cần đọc (dựng màn hình
 * `GET /access-control/me` và di trú vai trò cũ). Tách thành cổng riêng để `access-control`
 * **không** phụ thuộc ngược vào `identity` — chiều phụ thuộc là identity → access-control.
 */
export interface DirectoryUser {
  id: string;
  username: string;
  displayName: string;
  title: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  organizationId: string | null;
  /** Loại tài khoản tự đăng ký (F00): `ENTERPRISE`/`INDIVIDUAL`; tài khoản nội bộ là `null`. */
  accountType: string | null;
  /** Mã số thuế — chỉ tài khoản doanh nghiệp có (BUG-024: tự điền khi khai hồ sơ). */
  taxCode: string | null;
  /** Số CCCD/hộ chiếu — chỉ tài khoản cá nhân có. */
  idNumber: string | null;
  /** Người đại diện — chỉ tài khoản doanh nghiệp có. */
  representativeName: string | null;
  avatarUrl: string | null;
}

export interface UserDirectory {
  findById(userId: string): Promise<DirectoryUser | null>;
  findAll(): Promise<DirectoryUser[]>;
  /** Gán đơn vị cho tài khoản khi di trú; chỉ ghi khi tài khoản chưa có đơn vị. */
  setOrganization(userId: string, organizationId: string): Promise<void>;
  /** Danh sách tài khoản đang được phân công một mã số thuế doanh nghiệp. */
  findIdsByTaxCode(taxCode: string): Promise<string[]>;
  /** Danh sách tài khoản đang mang một vai trò RBAC (theo mã vai trò). */
  findIdsByRoleCode(roleCode: string): Promise<string[]>;
  /** Danh sách tài khoản có ít nhất một vai trò thuộc danh sách roleCodes (hoạt động). */
  findIdsByRoleCodes(roleCodes: string[]): Promise<string[]>;
  /** Danh sách tài khoản phụ trách bước quy trình (khớp vai trò được phân công cho bước đó). */
  findIdsByStepCode(stepCode: string): Promise<string[]>;
}

