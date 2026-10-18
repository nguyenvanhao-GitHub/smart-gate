import { PaginatedResult } from '../../../../common/http/pagination';
import { UserAccount } from '../../domain/user.entity';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserSearchCriteria {
  /** Mã vai trò RBAC (bảng `roles.code`), ví dụ `SYS_ADMIN`. Mã lạ thì trả danh sách rỗng. */
  roleCode?: string;
  status?: string;
  keyword?: string;
  organizationId?: string;
  page?: number;
  pageSize?: number;
}

export interface UserRepository {
  count(): Promise<number>;
  findMany(criteria: UserSearchCriteria): Promise<PaginatedResult<UserAccount>>;
  findById(id: string): Promise<UserAccount | null>;
  findByUsername(username: string): Promise<UserAccount | null>;
  /** Dò trùng email khi đăng ký (F00). Không so khớp giá trị rỗng. */
  findByEmail(email: string): Promise<UserAccount | null>;
  /** Dò trùng số điện thoại khi đăng ký (F00). Không so khớp giá trị rỗng. */
  findByPhone(phone: string): Promise<UserAccount | null>;
  /** Dò trùng mã số thuế doanh nghiệp khi đăng ký (F00). Không so khớp giá trị rỗng. */
  findByTaxCode(taxCode: string): Promise<UserAccount | null>;
  /** Dò trùng số CCCD/Hộ chiếu cá nhân khi đăng ký (F00). Không so khớp giá trị rỗng. */
  findByIdNumber(idNumber: string): Promise<UserAccount | null>;
  save(user: UserAccount): Promise<UserAccount>;
  delete(id: string): Promise<void>;
}
