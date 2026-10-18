import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import {
  USER_ACCESS_REPOSITORY,
  UserAccessRepository,
} from '../../../access-control/application/ports/user-access.repository';
import { AccountType } from '../../domain/user.entity';
import { PublicUserDto, toPublicUser } from '../dto/public-user.dto';
import { UpdateUserCommand } from '../dto/update-user.command';
import { USER_REPOSITORY, UserRepository } from '../ports/user.repository';
import { defaultRouteForRoles } from '../services/default-route';
import { isSelfRegisteredAccountType, selfRegisteredRoleGrants } from '../services/self-registered-role';
import { UserViewAssembler } from '../services/user-view.assembler';
import { appConflict, appNotFound, AppFieldError } from '../../../../common/i18n';

@Injectable()
export class UpdateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(USER_ACCESS_REPOSITORY)
    private readonly userAccess: UserAccessRepository,
    private readonly assembler: UserViewAssembler,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: UpdateUserCommand): Promise<PublicUserDto> {
    const user = await this.users.findById(command.userId);
    if (!user) throw appNotFound('user.notFound');

    const errors: AppFieldError[] = [];

    const [
      existingEmail,
      existingPhone,
      existingTaxCode,
      existingIdNumber
    ] = await Promise.all([
      command.email?.trim() ? this.users.findByEmail(command.email.trim()) : Promise.resolve(null),
      command.phone?.trim() ? this.users.findByPhone(command.phone.trim()) : Promise.resolve(null),
      command.taxCode?.trim() ? this.users.findByTaxCode(command.taxCode.trim()) : Promise.resolve(null),
      command.idNumber?.trim() ? this.users.findByIdNumber(command.idNumber.trim()) : Promise.resolve(null)
    ]);

    if (existingEmail && existingEmail.id !== user.id) errors.push({ field: 'email', messageKey: 'auth.registerDuplicateEmail' });
    if (existingPhone && existingPhone.id !== user.id) errors.push({ field: 'phone', messageKey: 'auth.registerDuplicatePhone' });
    if (existingTaxCode && existingTaxCode.id !== user.id) errors.push({ field: 'taxCode', messageKey: 'auth.registerDuplicateTaxCode' });
    if (existingIdNumber && existingIdNumber.id !== user.id) errors.push({ field: 'idNumber', messageKey: 'auth.registerDuplicateIdNumber' });

    if (errors.length > 0) {
      throw appConflict(errors[0].messageKey, undefined, { errors });
    }

    const beforeRoles = (await this.userAccess.listRoles(user.id)).map((role) => role.roleCode);
    const before = { ...toPublicUser(user), roles: beforeRoles };

    // Khi đổi loại tài khoản ngoài hệ thống (DN/cá nhân), API tự đồng bộ vai trò và trang mặc định.
    const requestedAccountType = command.accountType !== undefined ? (command.accountType ?? null) : undefined;
    const automaticRoles =
      requestedAccountType !== undefined && isSelfRegisteredAccountType(requestedAccountType)
        ? selfRegisteredRoleGrants(requestedAccountType)
        : null;
    const cleanRoute = command.defaultRoute !== undefined ? (command.defaultRoute?.trim() || undefined) : undefined;
    const derivedRoute =
      cleanRoute !== undefined
        ? cleanRoute
        : (automaticRoles
            ? defaultRouteForRoles(automaticRoles.map((role) => role.roleCode), requestedAccountType)
            : undefined);
    // Chỉ khi client gửi `accountType` mới đụng tới nhóm trường định danh: chuẩn hóa theo loại và
    // xóa trường không thuộc loại (vd chuyển cá nhân → doanh nghiệp thì bỏ CCCD). Không gửi thì giữ nguyên.
    const clean = (value?: string): string | null => {
      const trimmed = value?.trim() ?? '';
      return trimmed.length > 0 ? trimmed : null;
    };
    const isEnterprise = command.accountType === AccountType.ENTERPRISE;
    const isIndividual = command.accountType === AccountType.INDIVIDUAL;
    const identity =
      command.accountType === undefined
        ? {}
        : {
            accountType: command.accountType,
            taxCode: isEnterprise ? clean(command.taxCode) : null,
            representativeName: isEnterprise ? clean(command.representativeName) : null,
            idNumber: isIndividual ? clean(command.idNumber) : null,
            address: clean(command.address),
          };
    user.updateProfile({
      displayName: command.displayName,
      title: command.title,
      defaultRoute: derivedRoute,
      status: command.status,
      email: command.email,
      phone: command.phone,
      organizationId: command.organizationId,
      ...identity,
    });
    const saved = await this.users.save(user);

    if (automaticRoles) await this.userAccess.replaceRoles(saved.id, automaticRoles);

    const view = await this.assembler.assemble(saved);
    await this.audit.record({
      action: 'USER_UPDATE',
      targetType: 'USER',
      targetId: user.id,
      before,
      after: { ...toPublicUser(saved), roles: view.roles.map((role) => role.code) },
    });
    return view;
  }
}
