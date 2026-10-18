import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import {
  USER_ACCESS_REPOSITORY,
  UserAccessRepository,
} from '../../../access-control/application/ports/user-access.repository';
import { AccountType, UserAccount } from '../../domain/user.entity';
import { CreateUserCommand } from '../dto/create-user.command';
import { PublicUserDto, toPublicUser } from '../dto/public-user.dto';
import { USER_REPOSITORY, UserRepository } from '../ports/user.repository';
import { defaultRouteForRoles } from '../services/default-route';
import { PasswordService } from '../services/password.service';
import {
  isSelfRegisteredAccountType,
  selfRegisteredRoleGrants,
} from '../services/self-registered-role';
import { UserViewAssembler } from '../services/user-view.assembler';
import { appConflict, AppFieldError } from '../../../../common/i18n';

@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(USER_ACCESS_REPOSITORY)
    private readonly userAccess: UserAccessRepository,
    private readonly passwords: PasswordService,
    private readonly assembler: UserViewAssembler,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: CreateUserCommand): Promise<PublicUserDto> {
    const username = command.username.trim().toLowerCase();

    // Thu thập tất cả các lỗi để trả về cùng lúc thay vì ném lỗi ở field đầu tiên
    const errors: AppFieldError[] = [];

    const [
      existingUsername,
      existingEmail,
      existingPhone,
      existingTaxCode,
      existingIdNumber
    ] = await Promise.all([
      this.users.findByUsername(username),
      command.email?.trim() ? this.users.findByEmail(command.email.trim()) : Promise.resolve(null),
      command.phone?.trim() ? this.users.findByPhone(command.phone.trim()) : Promise.resolve(null),
      command.taxCode?.trim() ? this.users.findByTaxCode(command.taxCode.trim()) : Promise.resolve(null),
      command.idNumber?.trim() ? this.users.findByIdNumber(command.idNumber.trim()) : Promise.resolve(null)
    ]);

    if (existingUsername) errors.push({ field: 'username', messageKey: 'auth.registerDuplicateUsername' });
    if (existingEmail) errors.push({ field: 'email', messageKey: 'auth.registerDuplicateEmail' });
    if (existingPhone) errors.push({ field: 'phone', messageKey: 'auth.registerDuplicatePhone' });
    if (existingTaxCode) errors.push({ field: 'taxCode', messageKey: 'auth.registerDuplicateTaxCode' });
    if (existingIdNumber) errors.push({ field: 'idNumber', messageKey: 'auth.registerDuplicateIdNumber' });

    if (errors.length > 0) {
      throw appConflict(errors[0].messageKey, undefined, { errors });
    }

    // Chỉ giữ trường định danh khớp loại tài khoản; tài khoản nội bộ (accountType rỗng) không có
    // mã số thuế/CCCD/địa chỉ/người đại diện — tránh ghi lẫn dữ liệu giữa các loại.
    const accountType = command.accountType ?? null;
    const isEnterprise = accountType === AccountType.ENTERPRISE;
    const isIndividual = accountType === AccountType.INDIVIDUAL;
    // Loại tài khoản quyết định vai trò: DN → ENTERPRISE, cá nhân → INDIVIDUAL, cùng phạm vi OWN.
    // Tài khoản nội bộ được gán vai trò ở endpoint riêng sau khi tạo.
    const roleGrants = isSelfRegisteredAccountType(accountType)
      ? selfRegisteredRoleGrants(accountType)
      : [];
    // Trang mặc định được suy từ vai trò tự động; nội bộ chưa gán vai trò thì dùng fallback.
    const roleCodes = roleGrants.map((role) => role.roleCode);
    const clean = (value?: string): string | null => {
      const trimmed = value?.trim() ?? '';
      return trimmed.length > 0 ? trimmed : null;
    };
    const saved = await this.users.save(
      UserAccount.create({
        username,
        passwordHash: this.passwords.hash(command.password),
        displayName: command.displayName,
        title: command.title,
        defaultRoute: command.defaultRoute ?? defaultRouteForRoles(roleCodes, accountType),
        email: command.email ?? null,
        phone: command.phone ?? null,
        organizationId: command.organizationId ?? null,
        accountType,
        taxCode: isEnterprise ? clean(command.taxCode) : null,
        representativeName: isEnterprise ? clean(command.representativeName) : null,
        idNumber: isIndividual ? clean(command.idNumber) : null,
        address: accountType ? clean(command.address) : null,
      }),
    );

    if (roleGrants.length > 0) {
      await this.userAccess.replaceRoles(saved.id, roleGrants);
    }

    const view = await this.assembler.assemble(saved);
    await this.audit.record({
      action: 'USER_CREATE',
      targetType: 'USER',
      targetId: saved.id,
      after: { ...toPublicUser(saved), roles: view.roles.map((role) => role.code) },
    });
    return view;
  }
}
