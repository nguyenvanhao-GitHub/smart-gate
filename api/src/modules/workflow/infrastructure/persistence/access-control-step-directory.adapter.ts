import { Inject, Injectable } from '@nestjs/common';
import {
  WORKFLOW_STEP_ROLE_REPOSITORY,
  WorkflowStepRoleRepository,
} from '../../../access-control/application/ports/workflow-step-role.repository';
import { WorkflowStepDirectory } from '../../application/ports/workflow-step-directory.port';
import { WorkflowStepRoleRow } from '../../domain/workflow-route';

/**
 * Nối phân hệ `workflow` với bảng `workflow_step_roles` do `access-control` quản lý.
 * Nhờ cổng này, phân hệ workflow không biết gì về ORM của access-control.
 */
@Injectable()
export class AccessControlStepDirectoryAdapter implements WorkflowStepDirectory {
  constructor(
    @Inject(WORKFLOW_STEP_ROLE_REPOSITORY)
    private readonly stepRoles: WorkflowStepRoleRepository,
  ) {}

  async listStepRoles(): Promise<WorkflowStepRoleRow[]> {
    const rows = await this.stepRoles.findAll();
    return rows.map((row) => ({
      stepCode: row.stepCode,
      roleCode: row.roleCode,
      sortOrder: row.sortOrder,
      force: row.force,
    }));
  }
}
