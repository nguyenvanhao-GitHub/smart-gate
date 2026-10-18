import { Inject, Injectable } from '@nestjs/common';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { PaginatedResult } from '../../../../common/http/pagination';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { DeclarationType } from '../../../declarations/domain/declaration.enums';
import { WorkflowInstance } from '../../domain/workflow-instance.entity';
import { WorkflowRoute } from '../../domain/workflow-route';
import { QueueItemView, toQueueItemView } from '../dto/workflow-view.dto';
import { ListWorkflowQueueCommand } from '../dto/list-workflow-queue.command';
import {
  WORKFLOW_INSTANCE_REPOSITORY,
  WorkflowInstanceRepository,
  WorkflowQueueRow,
} from '../ports/workflow-instance.repository';
import { WorkflowRouteService } from '../services/workflow-route.service';

import { parseFilterEndDate, parseFilterStartDate } from '../../../../common/time/vietnam-date';

/**
 * Hàng đợi liên ngành (UI-06). Ba tab: cần xử lý · đã xử lý · chờ bổ sung.
 *
 * Việc "hồ sơ này có phải việc của tôi không" được quy về **danh sách mã bước** mà vai trò của
 * người đăng nhập được xử lý — tính ở đây từ lộ trình đọc trong DB, rồi truyền xuống kho dữ liệu.
 * Nhờ vậy tầng persistence không phải biết gì về vai trò.
 */
@Injectable()
export class ListWorkflowQueueUseCase {
  constructor(
    @Inject(WORKFLOW_INSTANCE_REPOSITORY)
    private readonly instances: WorkflowInstanceRepository,
    private readonly routes: WorkflowRouteService,
    private readonly scope: DossierScopeService,
  ) {}

  async execute(command: ListWorkflowQueueCommand): Promise<PaginatedResult<QueueItemView>> {
    const exportRoute = await this.routes.routeFor(DeclarationType.EXPORT);
    const importRoute = await this.routes.routeFor(DeclarationType.IMPORT);
    const roleCodes = this.roleCodesOf(command.access);
    const scope = this.scope.toCriteria(command.access);

    const isAdmin = roleCodes.some((role) => ['SYS_ADMIN', 'ADMIN', 'MANAGEMENT'].includes(role));
    const inspectionStepCodes = [
      ...exportRoute.inspectionSteps.map((s) => s.code),
      ...importRoute.inspectionSteps.map((s) => s.code),
    ];
    const actionableStepCodes = isAdmin
      ? inspectionStepCodes
      : this.actionableStepCodes([exportRoute, importRoute], roleCodes);

    const page = await this.instances.findQueue({
      tab: command.tab,
      actorId: command.access.userId,
      isAdmin,
      actionableStepCodes,
      inspectionStepCodes,
      defaultExportStepCode: exportRoute.firstActionableStep?.code ?? null,
      defaultImportStepCode: importRoute.firstActionableStep?.code ?? null,
      unrestricted: scope.unrestricted,
      ownerUserId: scope.ownerUserId,
      taxCodes: scope.taxCodes,
      keyword: command.keyword,
      type: command.type,
      status: command.status,
      checkpoint: command.checkpoint,
      from: command.from ? (command.from instanceof Date ? command.from : parseFilterStartDate(command.from)) : undefined,
      to: command.to ? (command.to instanceof Date ? command.to : parseFilterEndDate(command.to)) : undefined,
      page: command.page,
      pageSize: command.pageSize,
    });

    return {
      ...page,
      items: page.items.map((row) => {
        const route = this.routeFor(row.dossier.type, exportRoute, importRoute);
        return toQueueItemView(this.instanceOf(row, route), row.dossier, route);
      }),
    };
  }

  private roleCodesOf(access: UserAccessContext): string[] {
    return access.roles.map((role) => role.code);
  }

  private actionableStepCodes(routes: WorkflowRoute[], roleCodes: string[]): string[] {
    const codes = new Set<string>();
    routes.forEach((route) =>
      route.inspectionSteps
        .filter((step) => step.roleCodes.some((role) => roleCodes.includes(role)))
        .forEach((step) => codes.add(step.code)),
    );
    return [...codes];
  }

  private routeFor(type: DeclarationType, exportRoute: WorkflowRoute, importRoute: WorkflowRoute): WorkflowRoute {
    return type === DeclarationType.EXPORT || type === DeclarationType.TRANSSHIPMENT_EXPORT
      ? exportRoute
      : importRoute;
  }

  /** Hồ sơ chưa có phiên trong DB thì dựng phiên **tạm trong bộ nhớ** — không ghi gì khi chỉ đọc. */
  private instanceOf(row: WorkflowQueueRow, route: WorkflowRoute): WorkflowInstance {
    if (row.instance) return row.instance;
    const startedAt = row.dossier.submittedAt ?? row.dossier.createdAt;
    return WorkflowInstance.start(row.dossier.id, row.dossier.type, route, startedAt);
  }
}
