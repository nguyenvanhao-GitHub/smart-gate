import { DataScopeLevel } from '../../domain/data-scope.enum';
import { OrganizationType } from '../../domain/organization.catalog';

/** Cấu trúc trả về cho `GET /access-control/me` — hợp đồng cố định với web. */
export interface AccessOrganizationDto {
  id: string;
  code: string;
  name: string;
}

export interface AccessUserDto {
  id: string;
  username: string;
  displayName: string;
  title: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  /** Loại tài khoản tự đăng ký (F00): `ENTERPRISE`/`INDIVIDUAL`; tài khoản nội bộ là `null`. */
  accountType: string | null;
  /** Mã số thuế — chỉ tài khoản doanh nghiệp có (BUG-024: web tự điền + khóa khi khai hồ sơ). */
  taxCode: string | null;
  /** Số CCCD/hộ chiếu — chỉ tài khoản cá nhân có. */
  idNumber: string | null;
  /** Người đại diện — chỉ tài khoản doanh nghiệp có. */
  representativeName: string | null;
  avatarUrl: string | null;
  isProtected?: boolean;
  status: string;
  organization: AccessOrganizationDto | null;
}

export interface AccessRoleDto {
  code: string;
  name: string;
  dataScope: DataScopeLevel;
}

export interface AccessAssignmentDto {
  type: string;
  code: string;
  name: string;
}

export interface AccessMenuItemDto {
  key: string;
  label: string;
  icon: string;
  route: string;
  children?: AccessMenuItemDto[];
}

export interface MyAccessDto {
  user: AccessUserDto;
  roles: AccessRoleDto[];
  permissions: string[];
  assignments: AccessAssignmentDto[];
  menu: AccessMenuItemDto[];
}

export interface RoleSummaryDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  userCount: number;
}

export interface OrganizationNodeDto {
  id: string;
  code: string;
  name: string;
  type: OrganizationType;
  parentId: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}
