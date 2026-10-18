import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../access-control/access-control.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AttachmentOrmEntity } from '../files/infrastructure/persistence/attachment.orm-entity';
import { STORAGE_PORT } from '../files/application/ports/storage.port';
import { S3StorageAdapter } from '../files/infrastructure/storage/s3-storage.adapter';
import { GATE_PASSAGE_TIMES } from '../../common/gate/gate-passage.port';
import { GateEventOrmEntity } from '../gate/infrastructure/persistence/gate-event.orm-entity';
import { TypeOrmGatePassageAdapter } from './infrastructure/persistence/typeorm-gate-passage.adapter';
import { DECLARATION_REPOSITORY } from './application/ports/declaration.repository';
import { DOCUMENT_TYPE_LIST_CATALOG } from './application/ports/document-type-list.port';
import { DOSSIER_ATTACHMENTS } from './application/ports/dossier-attachment.port';
import { REQUIRED_DOCUMENT_CATALOG } from './application/ports/required-document.port';
import { DossierScopeService } from './application/services/dossier-scope.service';
import { AttachDocumentsUseCase } from './application/use-cases/attach-documents.use-case';
import { CancelDeclarationUseCase } from './application/use-cases/cancel-declaration.use-case';
import { CopyDeclarationUseCase } from './application/use-cases/copy-declaration.use-case';
import { CreateDeclarationUseCase } from './application/use-cases/create-declaration.use-case';
import { DeleteDeclarationUseCase } from './application/use-cases/delete-declaration.use-case';
import { DetachDocumentUseCase } from './application/use-cases/detach-document.use-case';
import { GetDeclarationDetailUseCase } from './application/use-cases/get-declaration-detail.use-case';
import { ListDeclarationsUseCase } from './application/use-cases/list-declarations.use-case';
import { ListDocumentTypesUseCase } from './application/use-cases/list-document-types.use-case';
import { ListRequiredDocumentsUseCase } from './application/use-cases/list-required-documents.use-case';
import { SubmitDeclarationUseCase } from './application/use-cases/submit-declaration.use-case';
import { UpdateDeclarationUseCase } from './application/use-cases/update-declaration.use-case';
import { ValidateDeclarationUseCase } from './application/use-cases/validate-declaration.use-case';
import { AppointmentOrmEntity } from './infrastructure/persistence/appointment.orm-entity';
import { CargoItemOrmEntity } from './infrastructure/persistence/cargo-item.orm-entity';
import { CatalogDocumentTypeListAdapter } from './infrastructure/persistence/catalog-document-type-list.adapter';
import { CatalogRequiredDocumentAdapter } from './infrastructure/persistence/catalog-required-document.adapter';
import { DeclarationOrmEntity } from './infrastructure/persistence/declaration.orm-entity';
import { DriverOrmEntity } from './infrastructure/persistence/driver.orm-entity';
import { EnterpriseOrmEntity } from './infrastructure/persistence/enterprise.orm-entity';
import { TransshipmentVehicleOrmEntity } from './infrastructure/persistence/transshipment-vehicle.orm-entity';
import { TypeOrmDeclarationRepository } from './infrastructure/persistence/typeorm-declaration.repository';
import { TypeOrmDossierAttachmentAdapter } from './infrastructure/persistence/typeorm-dossier-attachment.adapter';
import { VehicleOrmEntity } from './infrastructure/persistence/vehicle.orm-entity';
import { DeclarationsController } from './presentation/http/declarations.controller';
import { DocumentTypesController } from './presentation/http/document-types.controller';
import { RequiredDocumentsController } from './presentation/http/required-documents.controller';
import { WorkflowPolicyService } from './application/workflow-policy.service';
// Tiến trình liên ngành THẬT cho mục 6 của màn chi tiết hồ sơ. Các provider persistence dưới đây
// được khai **tại đây** thay vì import `WorkflowModule`: chiều phụ thuộc hiện là `workflow` →
// `declarations`, import ngược sẽ tạo vòng module (cùng lý do với `AttachmentOrmEntity` ở trên).
import { WORKFLOW_INSTANCE_REPOSITORY } from '../workflow/application/ports/workflow-instance.repository';
import { WORKFLOW_STEP_DIRECTORY } from '../workflow/application/ports/workflow-step-directory.port';
import { WorkflowProvisioningService } from '../workflow/application/services/workflow-provisioning.service';
import { WorkflowRouteService } from '../workflow/application/services/workflow-route.service';
import { AccessControlStepDirectoryAdapter } from '../workflow/infrastructure/persistence/access-control-step-directory.adapter';
import { AgencyActionOrmEntity } from '../workflow/infrastructure/persistence/agency-action.orm-entity';
import { TypeOrmWorkflowInstanceRepository } from '../workflow/infrastructure/persistence/typeorm-workflow-instance.repository';
import { WorkflowInstanceStepOrmEntity } from '../workflow/infrastructure/persistence/workflow-instance-step.orm-entity';
import { WorkflowInstanceOrmEntity } from '../workflow/infrastructure/persistence/workflow-instance.orm-entity';

import { USER_REPOSITORY } from '../identity/application/ports/user.repository';
import { TypeOrmUserRepository } from '../identity/infrastructure/persistence/typeorm-user.repository';
import { UserOrmEntity } from '../identity/infrastructure/persistence/user.orm-entity';
import { DossierAccountLinkerService } from './application/services/dossier-account-linker.service';

@Module({
  imports: [
    // `AttachmentOrmEntity` được khai ở đây để đọc/gắn chứng từ của hồ sơ mà **không** import
    // `FilesModule` — chiều phụ thuộc hiện tại là `files` → `declarations`, import ngược sẽ tạo vòng.
    TypeOrmModule.forFeature([
      DeclarationOrmEntity,
      EnterpriseOrmEntity,
      VehicleOrmEntity,
      DriverOrmEntity,
      CargoItemOrmEntity,
      TransshipmentVehicleOrmEntity,
      AppointmentOrmEntity,
      AttachmentOrmEntity,
      UserOrmEntity,
      // Phiên xử lý liên ngành — chỉ để nạp/mở phiên cho mục 6 màn chi tiết (xem chú thích import).
      WorkflowInstanceOrmEntity,
      WorkflowInstanceStepOrmEntity,
      AgencyActionOrmEntity,
      // Sự kiện cổng — CR12: đọc mốc nhập/xuất cảnh (`GATE_PASSAGE_TIMES`) cho màn chi tiết. Khai
      // ngay tại đây vì chiều phụ thuộc là `gate` → `declarations`; import ngược sẽ tạo vòng module.
      GateEventOrmEntity,
    ]),
    // AccessControlModule cung cấp DataScopeService để lọc hồ sơ theo phạm vi dữ liệu.
    AccessControlModule,
    // CatalogModule cung cấp danh mục loại chứng từ và cấu hình chứng từ bắt buộc (chờ chốt D7).
    CatalogModule,
  ],
  controllers: [DeclarationsController, RequiredDocumentsController, DocumentTypesController],
  providers: [
    ListDeclarationsUseCase,
    ListRequiredDocumentsUseCase,
    ListDocumentTypesUseCase,
    CreateDeclarationUseCase,
    CopyDeclarationUseCase,
    UpdateDeclarationUseCase,
    DeleteDeclarationUseCase,
    GetDeclarationDetailUseCase,
    ValidateDeclarationUseCase,
    SubmitDeclarationUseCase,
    AttachDocumentsUseCase,
    DetachDocumentUseCase,
    WorkflowPolicyService,
    CancelDeclarationUseCase,
    DossierScopeService,
    DossierAccountLinkerService,
    { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
    // Nạp/mở phiên xử lý liên ngành cho `GetDeclarationDetailUseCase` (mục 6 UI-05).
    WorkflowRouteService,
    WorkflowProvisioningService,
    { provide: DECLARATION_REPOSITORY, useClass: TypeOrmDeclarationRepository },
    { provide: DOSSIER_ATTACHMENTS, useClass: TypeOrmDossierAttachmentAdapter },
    // Kho lưu trữ tệp — CR3 cần đọc/ghi để nhân bản tệp đính kèm khi sao chép hồ sơ. Khai `S3StorageAdapter`
    // trực tiếp (không import `FilesModule`) vì chiều phụ thuộc là `files` → `declarations`; import ngược
    // sẽ tạo vòng module. Adapter không giữ trạng thái nên instance riêng ở đây vẫn dùng chung cấu hình/bucket.
    { provide: STORAGE_PORT, useClass: S3StorageAdapter },
    { provide: GATE_PASSAGE_TIMES, useClass: TypeOrmGatePassageAdapter },
    { provide: REQUIRED_DOCUMENT_CATALOG, useClass: CatalogRequiredDocumentAdapter },
    { provide: DOCUMENT_TYPE_LIST_CATALOG, useClass: CatalogDocumentTypeListAdapter },
    { provide: WORKFLOW_INSTANCE_REPOSITORY, useClass: TypeOrmWorkflowInstanceRepository },
    { provide: WORKFLOW_STEP_DIRECTORY, useClass: AccessControlStepDirectoryAdapter },
  ],
  exports: [
    DECLARATION_REPOSITORY,
    DOSSIER_ATTACHMENTS,
    WorkflowPolicyService,
    DossierScopeService,
    // Phân hệ `workflow` dựng lại nguyên khối chi tiết hồ sơ cho UI-07 nên dùng lại use-case này
    // thay vì lắp ráp DossierDetail lần thứ hai.
    GetDeclarationDetailUseCase,
    // Phân hệ `gate` mượn lại đúng bộ này (đã đăng ký sẵn ở đây cho `WorkflowPolicyService`) để khép
    // phiên liên ngành khi xe qua cổng ra (F44) — cùng một instance repository mà `evaluateGate` đọc,
    // nên phiên cổng nạp/ghi luôn nhất quán. Tránh import ngược `WorkflowModule` (sẽ tạo vòng module).
    WORKFLOW_INSTANCE_REPOSITORY,
    WorkflowRouteService,
    WorkflowProvisioningService,
  ],
})
export class DeclarationsModule {}
