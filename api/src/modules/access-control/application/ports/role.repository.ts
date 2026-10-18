import { Role } from '../../domain/access-control.entities';
import { RoleDefinition } from '../../domain/role.catalog';

export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');

export interface CreateRoleInput {
  code: string;
  name: string;
  description?: string | null;
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
}

export interface RoleRepository {
  findAll(): Promise<Role[]>;
  findById(id: string): Promise<Role | null>;
  findByCode(code: string): Promise<Role | null>;
  /** Seed idempotent các vai trò mặc định kèm ma trận quyền lần đầu. */
  ensure(definitions: RoleDefinition[]): Promise<void>;
  /** Ghi đè toàn bộ ma trận quyền của một vai trò (thao tác lưu bảng UI-13). */
  replacePermissions(roleCode: string, permissionCodes: string[]): Promise<Role>;
  create(input: CreateRoleInput): Promise<Role>;
  update(id: string, input: UpdateRoleInput): Promise<Role>;
  /** Khóa (`false`) hoặc mở khóa (`true`) một vai trò — điều khiển cột `roles.is_active`. */
  setActive(id: string, active: boolean): Promise<Role>;
  delete(id: string): Promise<void>;
  /** Số người dùng đang được gán từng vai trò, khóa theo `roleId` — dùng cho màn UI-13. */
  countUsersByRole(): Promise<Record<string, number>>;
}
