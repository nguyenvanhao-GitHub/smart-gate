import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ACCESS_CONTEXT_PROVIDER } from '../../common/auth/access-context';
import { UserOrmEntity } from '../identity/infrastructure/persistence/user.orm-entity';
import { PermissionCatalogService } from './application/permission-catalog.service';
import { ORGANIZATION_REPOSITORY } from './application/ports/organization.repository';
import { PERMISSION_REPOSITORY } from './application/ports/permission.repository';
import { ROLE_REPOSITORY } from './application/ports/role.repository';
import { USER_ACCESS_REPOSITORY } from './application/ports/user-access.repository';
import { USER_DIRECTORY } from './application/ports/user-directory.repository';
import { WORKFLOW_STEP_ROLE_REPOSITORY } from './application/ports/workflow-step-role.repository';
import { AccessContextService } from './application/services/access-context.service';
import { AccessControlSeedService } from './application/services/access-control-seed.service';
import { DataScopeService } from './application/services/data-scope.service';
import { CreateRoleUseCase } from './application/use-cases/create-role.use-case';
import { DeleteRoleUseCase } from './application/use-cases/delete-role.use-case';
import { GetMyAccessUseCase } from './application/use-cases/get-my-access.use-case';
import { GetRolePermissionsUseCase } from './application/use-cases/get-role-permissions.use-case';
import { ListOrganizationsUseCase } from './application/use-cases/list-organizations.use-case';
import { ListPermissionCatalogUseCase } from './application/use-cases/list-permission-catalog.use-case';
import { ListRolesUseCase } from './application/use-cases/list-roles.use-case';
import { ReplaceRolePermissionsUseCase } from './application/use-cases/replace-role-permissions.use-case';
import { SetRoleActiveUseCase } from './application/use-cases/set-role-active.use-case';
import { UpdateRoleUseCase } from './application/use-cases/update-role.use-case';
import { OrganizationOrmEntity } from './infrastructure/persistence/organization.orm-entity';
import { PermissionOrmEntity } from './infrastructure/persistence/permission.orm-entity';
import { RolePermissionOrmEntity } from './infrastructure/persistence/role-permission.orm-entity';
import { RoleOrmEntity } from './infrastructure/persistence/role.orm-entity';
import { TypeOrmOrganizationRepository } from './infrastructure/persistence/typeorm-organization.repository';
import { TypeOrmPermissionRepository } from './infrastructure/persistence/typeorm-permission.repository';
import { TypeOrmRoleRepository } from './infrastructure/persistence/typeorm-role.repository';
import { TypeOrmUserAccessRepository } from './infrastructure/persistence/typeorm-user-access.repository';
import { TypeOrmUserDirectory } from './infrastructure/persistence/typeorm-user-directory.repository';
import { TypeOrmWorkflowStepRoleRepository } from './infrastructure/persistence/typeorm-workflow-step-role.repository';
import { UserAssignmentOrmEntity } from './infrastructure/persistence/user-assignment.orm-entity';
import { UserRoleOrmEntity } from './infrastructure/persistence/user-role.orm-entity';
import { WorkflowStepRoleOrmEntity } from './infrastructure/persistence/workflow-step-role.orm-entity';
import { AccessControlController } from './presentation/http/access-control.controller';
import { OrganizationsController } from './presentation/http/organizations.controller';

/**
 * Phân hệ phân quyền động (kế hoạch MVP mục 3.1). Không được import `IdentityModule` ở đây:
 * chiều phụ thuộc là identity → access-control; dữ liệu tài khoản đọc qua cổng `USER_DIRECTORY`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PermissionOrmEntity,
      RoleOrmEntity,
      RolePermissionOrmEntity,
      OrganizationOrmEntity,
      UserRoleOrmEntity,
      UserAssignmentOrmEntity,
      WorkflowStepRoleOrmEntity,
      UserOrmEntity,
    ]),
  ],
  controllers: [AccessControlController, OrganizationsController],
  providers: [
    { provide: PERMISSION_REPOSITORY, useClass: TypeOrmPermissionRepository },
    { provide: ROLE_REPOSITORY, useClass: TypeOrmRoleRepository },
    { provide: ORGANIZATION_REPOSITORY, useClass: TypeOrmOrganizationRepository },
    { provide: USER_ACCESS_REPOSITORY, useClass: TypeOrmUserAccessRepository },
    { provide: WORKFLOW_STEP_ROLE_REPOSITORY, useClass: TypeOrmWorkflowStepRoleRepository },
    { provide: USER_DIRECTORY, useClass: TypeOrmUserDirectory },
    AccessContextService,
    { provide: ACCESS_CONTEXT_PROVIDER, useExisting: AccessContextService },
    AccessControlSeedService,
    DataScopeService,
    GetMyAccessUseCase,
    ListPermissionCatalogUseCase,
    ListRolesUseCase,
    CreateRoleUseCase,
    UpdateRoleUseCase,
    DeleteRoleUseCase,
    SetRoleActiveUseCase,
    GetRolePermissionsUseCase,
    ReplaceRolePermissionsUseCase,
    ListOrganizationsUseCase,
    PermissionCatalogService,
  ],
  exports: [
    ACCESS_CONTEXT_PROVIDER,
    ROLE_REPOSITORY,
    ORGANIZATION_REPOSITORY,
    USER_ACCESS_REPOSITORY,
    USER_DIRECTORY,
    WORKFLOW_STEP_ROLE_REPOSITORY,
    DataScopeService,
    PermissionCatalogService,
  ],
})
export class AccessControlModule {}
