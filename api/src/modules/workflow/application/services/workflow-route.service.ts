import { Inject, Injectable } from '@nestjs/common';
import { DeclarationType } from '../../../declarations/domain/declaration.enums';
import { WorkflowRoute, buildWorkflowRoute } from '../../domain/workflow-route';
import { WORKFLOW_STEP_DIRECTORY, WorkflowStepDirectory } from '../ports/workflow-step-directory.port';
import { appInternalError } from '../../../../common/i18n';

/**
 * Dựng lộ trình xử lý của một loại hình hồ sơ từ bảng `workflow_step_roles`.
 * Cố ý **không cache**: cấu hình bước là dữ liệu quản trị sửa được, sửa xong phải có hiệu lực ngay.
 */
@Injectable()
export class WorkflowRouteService {
  constructor(
    @Inject(WORKFLOW_STEP_DIRECTORY)
    private readonly directory: WorkflowStepDirectory,
  ) {}

  async routeFor(type: DeclarationType): Promise<WorkflowRoute> {
    const rows = await this.directory.listStepRoles();
    const route = buildWorkflowRoute(type, rows);
    if (route.isEmpty) {
      throw appInternalError('workflow.routeNotConfigured', { type });
    }
    return route;
  }
}
