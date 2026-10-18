import { Inject, Injectable } from "@nestjs/common";
import {
  AUDIT_LOGGER,
  AuditLogger,
} from "../../../../common/audit/audit-logger.port";
import { AccountType, UserAccount, UserStatus } from "../../domain/user.entity";
import {
  USER_ACCESS_REPOSITORY,
  UserAccessRepository,
} from "../../../access-control/application/ports/user-access.repository";
import { RegisterUserCommand } from "../dto/register-user.command";
import { toPublicUser } from "../dto/public-user.dto";
import { USER_REPOSITORY, UserRepository } from "../ports/user.repository";
import { defaultRouteForRoles } from "../services/default-route";
import { PasswordService } from "../services/password.service";
import {
  selfRegisteredRoleCode,
  selfRegisteredRoleGrants,
} from "../services/self-registered-role";
import { appConflict, AppFieldError } from '../../../../common/i18n';
import { NOTIFICATION_PUBLISHER, NotificationPublisher } from "@common/notifications/notification-publisher.port";
import { NotificationType } from "@modules/notifications/domain/notification-type.enum";

/**
 * F00 — Đăng ký tự phục vụ.
 *
 * Tạo tài khoản ở trạng thái `PENDING` (chờ duyệt), tự gán vai trò theo loại tài khoản nhưng **chưa
 * đăng nhập được** cho tới khi admin duyệt (`POST /users/:id/actions/approve`). Không xác thực email/SMS —
 * bước chờ duyệt thay cho xác thực. Trùng username/email/điện thoại đều bị chặn 409.
 */
@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(USER_ACCESS_REPOSITORY)
    private readonly userAccess: UserAccessRepository,
    private readonly passwords: PasswordService,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
    @Inject(NOTIFICATION_PUBLISHER)
    private readonly notifications: NotificationPublisher,
  ) {}

  async execute(command: RegisterUserCommand): Promise<{ registered: true }> {
    const username = command.username.trim().toLowerCase();
    const email = command.email.trim();
    const phone = command.phone.trim();
    const taxCode = command.taxCode?.trim() || null;
    const idNumber = command.idNumber?.trim() || null;

    const errors: AppFieldError[] = [];

    const [
      existingUsername,
      existingEmail,
      existingPhone,
      existingTaxCode,
      existingIdNumber
    ] = await Promise.all([
      this.users.findByUsername(username),
      this.users.findByEmail(email),
      this.users.findByPhone(phone),
      taxCode ? this.users.findByTaxCode(taxCode) : Promise.resolve(null),
      idNumber ? this.users.findByIdNumber(idNumber) : Promise.resolve(null)
    ]);

    if (existingUsername) errors.push({ field: 'username', messageKey: 'auth.registerDuplicateUsername' });
    if (existingEmail) errors.push({ field: 'email', messageKey: 'auth.registerDuplicateEmail' });
    if (existingPhone) errors.push({ field: 'phone', messageKey: 'auth.registerDuplicatePhone' });
    if (existingTaxCode) errors.push({ field: 'taxCode', messageKey: 'auth.registerDuplicateTaxCode' });
    if (existingIdNumber) errors.push({ field: 'idNumber', messageKey: 'auth.registerDuplicateIdNumber' });

    if (errors.length > 0) {
      throw appConflict(errors[0].messageKey, undefined, { errors });
    }

    const isEnterprise = command.accountType === AccountType.ENTERPRISE;

    // Chỉ giữ trường định danh khớp loại tài khoản để tránh ghi lộn MST vào tài khoản cá nhân và ngược lại.
    const saved = await this.users.save(
      UserAccount.create({
        username,
        passwordHash: this.passwords.hash(command.password),
        displayName: command.displayName.trim(),
        // Chức danh do admin bổ sung khi duyệt; trang mặc định về màn hồ sơ cho tài khoản DN/cá nhân.
        title: "",
        defaultRoute: defaultRouteForRoles([], command.accountType),
        email,
        phone,
        status: UserStatus.PENDING,
        accountType: command.accountType,
        taxCode: isEnterprise ? taxCode : null,
        idNumber: isEnterprise ? null : idNumber,
        address: command.address.trim(),
        // Người đại diện chỉ có nghĩa với doanh nghiệp; cá nhân không lưu.
        representativeName: isEnterprise
          ? command.representativeName?.trim()
          : null,
      }),
    );

    const roleCode = selfRegisteredRoleCode(command.accountType);
    await this.userAccess.replaceRoles(
      saved.id,
      selfRegisteredRoleGrants(command.accountType),
    );

    await this.audit.record({
      action: "USER_REGISTER",
      targetType: "USER",
      targetId: saved.id,
      actorId: saved.id,
      actorUsername: saved.username,
      after: { ...toPublicUser(saved), roles: [roleCode] },
    });

    await this.notifications.publish({
      type: NotificationType.USER_REGISTERED,
      titleKey: 'notification.userRegisteredTitle',
      contentKey: 'notification.userRegisteredContent',
      contentParams: { username: saved.username },
      route: `/admin/users?keyword=${encodeURIComponent(saved.username)}`,
    });
    return { registered: true };
  }
}


