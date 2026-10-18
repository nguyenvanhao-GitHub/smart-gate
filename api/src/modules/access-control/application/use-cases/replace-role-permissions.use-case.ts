import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { SYS_ADMIN_CORE_PERMISSIONS, SYS_ADMIN_ROLE_CODE } from '../../domain/role.catalog';
import { ReplaceRolePermissionsCommand } from '../dto/replace-role-permissions.command';
import { ROLE_REPOSITORY, RoleRepository } from '../ports/role.repository';
import { appBadRequest, appNotFound } from '../../../../common/i18n';

/** Lưu một dòng ma trận phân quyền của UI-13. Ghi nhật ký cả trạng thái trước và sau (F05). */
@Injectable()
export class ReplaceRolePermissionsUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly roles: RoleRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: ReplaceRolePermissionsCommand): Promise<string[]> {
    const role = await this.roles.findById(command.roleId);
    if (!role) throw appNotFound('role.notFound');

    // BUG-059: chặn tự khóa toàn hệ thống — vai trò siêu quản trị luôn phải giữ đủ bộ quyền quản trị
    // cốt lõi. Đây là nguồn sự thật (BE), FE chỉ vô hiệu nút cho êm tay. Gỡ sạch/ma trận thiếu core → 400.
    if (role.code === SYS_ADMIN_ROLE_CODE) {
      const missing = SYS_ADMIN_CORE_PERMISSIONS.filter((code) => !command.permissions.includes(code));
      if (missing.length > 0) {
        throw appBadRequest('role.systemAdminCoreRequired', { codes: missing.join(', ') });
      }
    }

    const updated = await this.roles.replacePermissions(role.code, command.permissions);
    await this.audit.record({
      action: 'ROLE_PERMISSIONS_REPLACE',
      targetType: 'ROLE',
      targetId: role.id,
      before: { name: role.name, code: role.code, permissions: role.permissions },
      after: { name: role.name, code: role.code, permissions: updated.permissions },
    });
    return updated.permissions;
  }
}
