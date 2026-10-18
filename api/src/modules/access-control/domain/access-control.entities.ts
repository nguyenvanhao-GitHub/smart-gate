import { AssignmentType } from './assignment-type.enum';
import { DataScopeLevel } from './data-scope.enum';
import { OrganizationType } from './organization.catalog';
import { PermissionActionCode, PermissionModuleCode } from './permission.catalog';

/** Các thực thể RBAC là dữ liệu tham chiếu thuần (không có hành vi nghiệp vụ). */

export interface Organization {
  id: string;
  code: string;
  name: string;
  type: OrganizationType;
  parentId: string | null;
  isActive: boolean;
}

export interface Permission {
  id: string;
  code: string;
  module: PermissionModuleCode;
  moduleLabel: string;
  action: PermissionActionCode;
  actionLabel: string;
  name: string;
  sortOrder: number;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissions: string[];
}

export interface UserRoleGrant {
  roleCode: string;
  roleName: string;
  dataScope: DataScopeLevel;
  organizationId: string | null;
  organizationCode: string | null;
}

export interface UserAssignment {
  type: AssignmentType;
  value: string;
  label: string | null;
  organizationId: string | null;
}

/** Ảnh chụp quyền hiệu lực của một người dùng tại thời điểm truy vấn. */
export interface UserAccessSnapshot {
  userId: string;
  roles: UserRoleGrant[];
  permissions: string[];
  assignments: UserAssignment[];
}

export interface WorkflowStepRole {
  stepCode: string;
  force: string | null;
  roleCode: string;
  sortOrder: number;
}
