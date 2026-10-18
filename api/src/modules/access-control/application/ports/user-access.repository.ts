import { UserAccessSnapshot, UserAssignment, UserRoleGrant } from '../../domain/access-control.entities';
import { AssignmentType } from '../../domain/assignment-type.enum';
import { DataScopeLevel } from '../../domain/data-scope.enum';

export const USER_ACCESS_REPOSITORY = Symbol('USER_ACCESS_REPOSITORY');

export interface UserRoleGrantInput {
  roleCode: string;
  dataScope: DataScopeLevel;
  organizationCode?: string | null;
}

export interface UserAssignmentInput {
  type: AssignmentType;
  value: string;
  label?: string | null;
  organizationCode?: string | null;
}

export interface UserAccessRepository {
  /** Nạp quyền hiệu lực (hợp nhất từ mọi vai trò) của một người dùng. */
  loadSnapshot(userId: string): Promise<UserAccessSnapshot>;
  listRoles(userId: string): Promise<UserRoleGrant[]>;
  /** Nạp vai trò cho nhiều người dùng trong một lượt — dùng cho danh sách, tránh truy vấn N+1. */
  listRolesForUsers(userIds: string[]): Promise<Record<string, UserRoleGrant[]>>;
  listAssignments(userId: string): Promise<UserAssignment[]>;
  /** Thay toàn bộ vai trò của người dùng. */
  replaceRoles(userId: string, grants: UserRoleGrantInput[]): Promise<UserRoleGrant[]>;
  replaceAssignments(userId: string, assignments: UserAssignmentInput[]): Promise<UserAssignment[]>;
  countRoles(userId: string): Promise<number>;
}
