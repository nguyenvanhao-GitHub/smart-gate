import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ORGANIZATION_CATALOG } from '../../domain/organization.catalog';
import { PERMISSION_CATALOG } from '../../domain/permission.catalog';
import { ROLE_CATALOG } from '../../domain/role.catalog';
import { WORKFLOW_STEP_ROLE_CATALOG } from '../../domain/workflow-step-role.catalog';
import { ORGANIZATION_REPOSITORY, OrganizationRepository } from '../ports/organization.repository';
import { PERMISSION_REPOSITORY, PermissionRepository } from '../ports/permission.repository';
import { ROLE_REPOSITORY, RoleRepository } from '../ports/role.repository';
import {
  WORKFLOW_STEP_ROLE_REPOSITORY,
  WorkflowStepRoleRepository,
} from '../ports/workflow-step-role.repository';

/**
 * Nạp dữ liệu nền của RBAC động: 60 mã quyền, cây đơn vị, vai trò seed kèm ma trận quyền và bảng
 * vai trò theo bước nghiệp vụ.
 *
 * Toàn bộ đều **idempotent**: chạy lại nhiều lần không nhân bản bản ghi và không ghi đè cấu hình
 * quản trị viên đã sửa trên UI-13 (chi tiết ở từng repository).
 *
 * Việc gán vai trò RBAC cho tài khoản mặc định **không** nằm ở đây mà ở `UserSeedService` (phân hệ
 * identity), vì nó phải chạy **sau** khi tài khoản mặc định được tạo và cần ghi thẳng `user_roles`.
 */
@Injectable()
export class AccessControlSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AccessControlSeedService.name);

  constructor(
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissions: PermissionRepository,
    @Inject(ROLE_REPOSITORY)
    private readonly roles: RoleRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    @Inject(WORKFLOW_STEP_ROLE_REPOSITORY)
    private readonly workflowStepRoles: WorkflowStepRoleRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.permissions.ensure(PERMISSION_CATALOG);
    await this.organizations.ensure(ORGANIZATION_CATALOG);
    // Vai trò phải có sau quyền (ma trận tham chiếu permission_id) và trước bảng bước nghiệp vụ.
    await this.roles.ensure(ROLE_CATALOG);
    await this.workflowStepRoles.ensure(WORKFLOW_STEP_ROLE_CATALOG);

    this.logger.log(
      `Đã đồng bộ dữ liệu phân quyền: ${PERMISSION_CATALOG.length} quyền, ${ROLE_CATALOG.length} vai trò, ${ORGANIZATION_CATALOG.length} đơn vị.`,
    );
  }
}
