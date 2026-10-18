import { Permission } from '../../domain/access-control.entities';
import { PermissionDefinition } from '../../domain/permission.catalog';

export const PERMISSION_REPOSITORY = Symbol('PERMISSION_REPOSITORY');

export interface PermissionRepository {
  findAll(): Promise<Permission[]>;
  /** Đồng bộ danh mục 60 mã quyền xuống DB (thêm mới, cập nhật nhãn). */
  ensure(definitions: PermissionDefinition[]): Promise<void>;
}
