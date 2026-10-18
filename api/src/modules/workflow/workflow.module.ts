import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../access-control/access-control.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DeclarationsModule } from '../declarations/declarations.module';
import { FeesModule } from '../fees/fees.module';
import { UserOrmEntity } from '../identity/infrastructure/persistence/user.orm-entity';
import { REASON_CODE_CATALOG } from './application/ports/reason-code.port';
import { WORKFLOW_ACTOR_DIRECTORY } from './application/ports/workflow-actor.port';
import {
  WORKFLOW_CHECKLIST_CATALOG,
  WORKFLOW_CHECKLIST_REPOSITORY,
} from './application/ports/workflow-checklist.port';
import { WORKFLOW_INSTANCE_REPOSITORY } from './application/ports/workflow-instance.repository';
import { WORKFLOW_STEP_DIRECTORY } from './application/ports/workflow-step-directory.port';
import { WorkflowProvisioningService } from './application/services/workflow-provisioning.service';
import { WorkflowRouteService } from './application/services/workflow-route.service';
import { DecideWorkflowStepUseCase } from './application/use-cases/decide-workflow-step.use-case';
import { GetWorkflowDossierUseCase } from './application/use-cases/get-workflow-dossier.use-case';
import { ListWorkflowQueueUseCase } from './application/use-cases/list-workflow-queue.use-case';
import { AccessControlStepDirectoryAdapter } from './infrastructure/persistence/access-control-step-directory.adapter';
import { AgencyActionOrmEntity } from './infrastructure/persistence/agency-action.orm-entity';
import { CatalogChecklistAdapter } from './infrastructure/persistence/catalog-checklist.adapter';
import { CatalogReasonCodeAdapter } from './infrastructure/persistence/catalog-reason-code.adapter';
import { TypeOrmWorkflowChecklistRepository } from './infrastructure/persistence/typeorm-workflow-checklist.repository';
import { TypeOrmWorkflowInstanceRepository } from './infrastructure/persistence/typeorm-workflow-instance.repository';
import { UserActorDirectoryAdapter } from './infrastructure/persistence/user-actor-directory.adapter';
import { WorkflowChecklistStateOrmEntity } from './infrastructure/persistence/workflow-checklist-state.orm-entity';
import { WorkflowInstanceStepOrmEntity } from './infrastructure/persistence/workflow-instance-step.orm-entity';
import { WorkflowInstanceOrmEntity } from './infrastructure/persistence/workflow-instance.orm-entity';
import { WorkflowController } from './presentation/http/workflow.controller';

/**
 * Phân hệ xử lý liên ngành (P3).
 *
 * Chiều phụ thuộc: `workflow` → `declarations` (đọc hồ sơ, phạm vi dữ liệu),
 * `workflow` → `access-control` (bảng `workflow_step_roles`), `workflow` → `catalog`
 * (mã nguyên nhân, checklist), `workflow` → `fees` (**chỉ** cổng `FEE_SETTLEMENT` — nghĩa vụ tài
 * chính của hồ sơ, F48). **Không** có chiều ngược lại: phiên xử lý được mở lúc cần dùng
 * (`WorkflowProvisioningService`) chứ không do `declarations` gọi sang.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkflowInstanceOrmEntity,
      WorkflowInstanceStepOrmEntity,
      AgencyActionOrmEntity,
      WorkflowChecklistStateOrmEntity,
      // Chỉ để đọc tên hiển thị người thao tác — không import IdentityModule để khỏi tạo vòng.
      UserOrmEntity,
    ]),
    DeclarationsModule,
    AccessControlModule,
    CatalogModule,
    // Dùng cổng `FEE_SETTLEMENT` (nghĩa vụ tài chính của hồ sơ — F48; bước thu phí chỉ duyệt được khi
    // đã thanh toán đủ) và cổng `FEE_CALCULATOR` (tự tính phí khi hồ sơ vừa tới bước thu phí). `fees`
    // không phụ thuộc ngược vào `workflow` nên chiều `workflow` → `fees` không tạo vòng.
    FeesModule,
  ],
  controllers: [WorkflowController],
  providers: [
    WorkflowRouteService,
    WorkflowProvisioningService,
    ListWorkflowQueueUseCase,
    GetWorkflowDossierUseCase,
    DecideWorkflowStepUseCase,
    { provide: WORKFLOW_INSTANCE_REPOSITORY, useClass: TypeOrmWorkflowInstanceRepository },
    { provide: WORKFLOW_CHECKLIST_REPOSITORY, useClass: TypeOrmWorkflowChecklistRepository },
    { provide: WORKFLOW_CHECKLIST_CATALOG, useClass: CatalogChecklistAdapter },
    { provide: WORKFLOW_STEP_DIRECTORY, useClass: AccessControlStepDirectoryAdapter },
    { provide: REASON_CODE_CATALOG, useClass: CatalogReasonCodeAdapter },
    { provide: WORKFLOW_ACTOR_DIRECTORY, useClass: UserActorDirectoryAdapter },
  ],
  exports: [WORKFLOW_INSTANCE_REPOSITORY, WorkflowRouteService, WorkflowProvisioningService],
})
export class WorkflowModule {}
