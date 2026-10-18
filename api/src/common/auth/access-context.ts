import { DataScopeLevel } from '../../modules/access-control/domain/data-scope.enum';

export interface AccessRole {
  code: string;
  name: string;
  dataScope: DataScopeLevel;
  organizationId?: string;
  organizationCode?: string;
}

export interface AccessAssignment {
  type: string;
  value: string;
  label?: string;
  organizationId?: string;
}

/** Quyền hiệu lực của một người dùng, hợp nhất từ mọi vai trò được gán. */
export interface UserAccessContext {
  userId: string;
  roles: AccessRole[];
  permissions: string[];
  assignments: AccessAssignment[];
}

export const ACCESS_CONTEXT_PROVIDER = Symbol('ACCESS_CONTEXT_PROVIDER');

export interface AccessContextProvider {
  loadForUser(userId: string): Promise<UserAccessContext>;
}

export function hasPermission(context: UserAccessContext | undefined, permission: string): boolean {
  return !!context?.permissions.includes(permission);
}

export function hasAnyPermission(context: UserAccessContext | undefined, permissions: string[]): boolean {
  return permissions.some((permission) => hasPermission(context, permission));
}

export const EMPTY_ACCESS_CONTEXT = (userId: string): UserAccessContext => ({
  userId,
  roles: [],
  permissions: [],
  assignments: [],
});

/**
 * Ngữ cảnh cho **thao tác hệ thống tự động** (không do người dùng khởi tạo, ví dụ tự tính phí khi hồ
 * sơ tới bước thu phí). Phạm vi `ALL` để bỏ qua ràng buộc dữ liệu theo doanh nghiệp/bước — thao tác
 * nội bộ đã được quyết định ở tầng trên. **Không mang quyền nào**: chỉ dùng cho các use-case chỉ kiểm
 * phạm vi dữ liệu, KHÔNG dùng để lách kiểm quyền.
 */
export const SYSTEM_ACCESS_CONTEXT: UserAccessContext = {
  userId: 'system',
  roles: [{ code: 'SYSTEM', name: 'Hệ thống', dataScope: DataScopeLevel.ALL }],
  permissions: [],
  assignments: [],
};
