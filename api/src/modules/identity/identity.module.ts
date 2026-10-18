import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../access-control/access-control.module';
import { USER_REPOSITORY } from './application/ports/user.repository';
import { AuthContextService } from './application/services/auth-context.service';
import { AuthTokenService } from './application/services/auth-token.service';
import { IdentityService } from './application/services/identity.service';
import { PasswordService } from './application/services/password.service';
import { UserSeedService } from './application/services/user-seed.service';
import { UserViewAssembler } from './application/services/user-view.assembler';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { DeleteUserUseCase } from './application/use-cases/delete-user.use-case';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';
import { LockUserUseCase } from './application/use-cases/lock-user.use-case';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { ReplaceUserAssignmentsUseCase } from './application/use-cases/replace-user-assignments.use-case';
import { ReplaceUserRolesUseCase } from './application/use-cases/replace-user-roles.use-case';
import { ResetUserPasswordUseCase } from './application/use-cases/reset-user-password.use-case';
import { UnlockUserUseCase } from './application/use-cases/unlock-user.use-case';
import { ApproveUserUseCase } from './application/use-cases/approve-user.use-case';
import { UpdateProfileUseCase } from './application/use-cases/update-profile.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { LookupUserUseCase } from './application/use-cases/lookup-user.use-case';
import { TypeOrmUserRepository } from './infrastructure/persistence/typeorm-user.repository';
import { UserOrmEntity } from './infrastructure/persistence/user.orm-entity';
import { AuthController } from './presentation/http/auth.controller';
import { ProfileController } from './presentation/http/profile.controller';
import { UsersController } from './presentation/http/users.controller';

@Module({
  // identity phụ thuộc access-control (vai trò, phân công, đơn vị) — không được để chiều ngược lại.
  imports: [TypeOrmModule.forFeature([UserOrmEntity]), AccessControlModule],
  controllers: [AuthController, UsersController, ProfileController],
  providers: [
    PasswordService,
    AuthTokenService,
    AuthContextService,
    IdentityService,
    UserSeedService,
    UserViewAssembler,
    ListUsersUseCase,
    RegisterUserUseCase,
    CreateUserUseCase,
    UpdateUserUseCase,
    DeleteUserUseCase,
    ResetUserPasswordUseCase,
    LockUserUseCase,
    UnlockUserUseCase,
    ApproveUserUseCase,
    ReplaceUserRolesUseCase,
    ReplaceUserAssignmentsUseCase,
    UpdateProfileUseCase,
    ChangePasswordUseCase,
    LookupUserUseCase,
    { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
  ],
  exports: [IdentityService, AuthContextService, AuthTokenService],
})
export class IdentityModule {}
