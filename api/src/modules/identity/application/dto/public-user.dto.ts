import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { AccountType, UserAccount, UserStatus } from '../../domain/user.entity';

export interface PublicUserOrganizationDto {
  id: string;
  code: string;
  name: string;
}

export interface PublicUserRoleDto {
  code: string;
  name: string;
  dataScope: DataScopeLevel;
}

/**
 * Một khái niệm chỉ có một hình dạng trên toàn API: phân công trả về ở đây trùng đúng shape với
 * `assignments` của `GET /access-control/me`.
 */
export interface PublicUserAssignmentDto {
  type: string;
  code: string;
  name: string;
}

/**
 * DTO thu hẹp cho API lookup tài khoản khi khai báo hồ sơ (SG-281).
 * Chỉ trả về thông tin cần thiết để tự điền form, không lộ vai trò, trạng thái, nhật ký đăng nhập.
 */
export interface LookupUserDto {
  id: string;
  username: string;
  displayName: string;
  title: string;
  email: string | null;
  phone: string | null;
  accountType: AccountType | null;
  taxCode: string | null;
  idNumber: string | null;
  address: string | null;
  representativeName: string | null;
  organization: { id: string; name: string } | null;
}

/** Hình chiếu công khai của tài khoản — không bao giờ chứa `passwordHash`. */
export interface PublicUserDto {
  id: string;
  username: string;
  displayName: string;
  title: string;
  email: string | null;
  phone: string | null;
  defaultRoute: string;
  /** Loại tài khoản tự đăng ký (F00): DN/cá nhân; `null` với tài khoản do admin tạo. */
  accountType: AccountType | null;
  /** Mã số thuế — chỉ tài khoản doanh nghiệp mới có. */
  taxCode: string | null;
  /** Số CCCD/hộ chiếu — chỉ tài khoản cá nhân mới có. */
  idNumber: string | null;
  /** Địa chỉ liên hệ — tài khoản tự đăng ký khai; `null` với tài khoản nội bộ. */
  address: string | null;
  /** Người đại diện — chỉ tài khoản doanh nghiệp mới có. */
  representativeName: string | null;
  avatarUrl: string | null;
  isProtected?: boolean;
  organizationId: string | null;
  organization: PublicUserOrganizationDto | null;
  roles: PublicUserRoleDto[];
  status: UserStatus;
  lockReason: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Bản tối giản: chưa gắn đơn vị và vai trò RBAC. Dùng cho ảnh chụp nhật ký kiểm toán.
 * Trả về cho web thì phải đi qua `UserViewAssembler` để có đủ `organization` + `roles`.
 */
export function toPublicUser(user: UserAccount): PublicUserDto {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    title: user.title,
    email: user.email,
    phone: user.phone,
    defaultRoute: user.defaultRoute,
    accountType: user.accountType,
    taxCode: user.taxCode,
    idNumber: user.idNumber,
    address: user.address,
    representativeName: user.representativeName,
    avatarUrl: user.avatarUrl,
    isProtected: user.isProtected ?? false,
    organizationId: user.organizationId,
    organization: null,
    roles: [],
    status: user.status,
    lockReason: user.lockReason,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function toLookupUserDto(view: PublicUserDto): LookupUserDto {
  return {
    id: view.id,
    username: view.username,
    displayName: view.displayName,
    title: view.title,
    email: view.email,
    phone: view.phone,
    accountType: view.accountType,
    taxCode: view.taxCode,
    idNumber: view.idNumber,
    address: view.address,
    representativeName: view.representativeName,
    organization: view.organization ? { id: view.organization.id, name: view.organization.name } : null,
  };
}

