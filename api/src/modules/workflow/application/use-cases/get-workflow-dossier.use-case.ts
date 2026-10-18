import { Inject, Injectable } from '@nestjs/common';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { GetDeclarationDetailUseCase } from '../../../declarations/application/use-cases/get-declaration-detail.use-case';
import {
  DECLARATION_REPOSITORY,
  DeclarationRepository,
} from '../../../declarations/application/ports/declaration.repository';
import { DossierScopeService } from '../../../declarations/application/services/dossier-scope.service';
import { effectiveRouteForInstance } from '../../domain/fee-step-gate.rules';
import { availableDecisions } from '../../domain/workflow-order.rules';
import {
  WorkflowDossierView,
  toChecklistView,
  toWorkflowInstanceView,
} from '../dto/workflow-view.dto';
import {
  WORKFLOW_CHECKLIST_CATALOG,
  WORKFLOW_CHECKLIST_REPOSITORY,
  WorkflowChecklistCatalog,
  WorkflowChecklistRepository,
} from '../ports/workflow-checklist.port';
import { WorkflowProvisioningService } from '../services/workflow-provisioning.service';
import { WorkflowRouteService } from '../services/workflow-route.service';
import { appNotFound } from '../../../../common/i18n';

/** Màn hình xử lý nghiệp vụ (UI-07): hồ sơ + tiến trình + checklist + quyết định khả dụng. */
@Injectable()
export class GetWorkflowDossierUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    private readonly dossierDetail: GetDeclarationDetailUseCase,
    private readonly scope: DossierScopeService,
    private readonly routes: WorkflowRouteService,
    private readonly provisioning: WorkflowProvisioningService,
    @Inject(WORKFLOW_CHECKLIST_CATALOG)
    private readonly checklistCatalog: WorkflowChecklistCatalog,
    @Inject(WORKFLOW_CHECKLIST_REPOSITORY)
    private readonly checklistStates: WorkflowChecklistRepository,
  ) {}

  async execute(dossierId: string, access: UserAccessContext): Promise<WorkflowDossierView> {
    const declaration = await this.declarations.findById(dossierId);
    if (!declaration) throw appNotFound('dossier.notFound');
    this.scope.assertAccessible(declaration, access);

    const fullRoute = await this.routes.routeFor(declaration.type);
    const instance = await this.provisioning.ensure(declaration, fullRoute);
    // CR29 — lộ trình khớp tập bước đã đóng băng của phiên (bỏ bước Thu phí nếu phiên mở lúc cờ tắt),
    // để stepper/`activeStage`/quyết định khả dụng không kẹt ở giai đoạn thu phí rỗng.
    const route = effectiveRouteForInstance(fullRoute, instance);

    const [dossier, definitions, states] = await Promise.all([
      this.dossierDetail.execute(dossierId, access),
      this.checklistCatalog.listDefinitions(),
      this.checklistStates.listStates(dossierId),
    ]);

    const roleCodes = access.roles.map((role) => role.code);

    return {
      dossier,
      instance: toWorkflowInstanceView(instance, route),
      checklist: toChecklistView(definitions, states),
      availableDecisions: availableDecisions(
        route,
        instance,
        access.permissions,
        roleCodes,
        declaration.epidemicFlag,
        declaration.status,
      ),
    };
  }
}
