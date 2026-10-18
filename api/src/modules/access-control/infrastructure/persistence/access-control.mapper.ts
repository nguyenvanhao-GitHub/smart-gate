import { Organization, Permission, Role } from '../../domain/access-control.entities';
import { OrganizationOrmEntity } from './organization.orm-entity';
import { PermissionOrmEntity } from './permission.orm-entity';
import { RoleOrmEntity } from './role.orm-entity';

/** Chuyển đổi giữa bản ghi ORM và thực thể RBAC thuần của tầng domain. */
export class AccessControlMapper {
  static toPermission(row: PermissionOrmEntity): Permission {
    return {
      id: row.id,
      code: row.code,
      module: row.module,
      moduleLabel: row.moduleLabel,
      action: row.action,
      actionLabel: row.actionLabel,
      name: row.name,
      sortOrder: row.sortOrder,
    };
  }

  static toRole(row: RoleOrmEntity, permissions: string[]): Role {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      isSystem: row.isSystem,
      isActive: row.isActive,
      permissions,
    };
  }

  static toOrganization(row: OrganizationOrmEntity): Organization {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type,
      parentId: row.parentId,
      isActive: row.isActive,
    };
  }
}
