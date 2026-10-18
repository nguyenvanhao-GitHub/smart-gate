import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger, AuditResult } from '../../../../common/audit/audit-logger.port';
import { ChangePasswordCommand } from '../dto/update-profile.command';
import { USER_REPOSITORY, UserRepository } from '../ports/user.repository';
import { PasswordService } from '../services/password.service';
import { appBadRequest, appNotFound } from '../../../../common/i18n';

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: ChangePasswordCommand): Promise<{ changed: true }> {
    const user = await this.users.findById(command.userId);
    if (!user) throw appNotFound('auth.accountNotFound');

    if (!this.passwords.verify(command.currentPassword, user.passwordHash)) {
      await this.audit.record({
        action: 'PROFILE_CHANGE_PASSWORD',
        targetType: 'USER',
        targetId: user.id,
        result: AuditResult.FAILURE,
        after: { reason: 'Mật khẩu hiện tại không đúng' },
      });
      // Sai mật khẩu hiện tại là lỗi dữ liệu đầu vào (400), KHÔNG phải hết phiên (401) — tránh để
      // FE hiểu nhầm thành "phiên đã hết hạn" rồi đăng xuất người dùng.
      throw appBadRequest('auth.currentPasswordWrong');
    }
    if (command.currentPassword === command.newPassword) {
      throw appBadRequest('auth.newPasswordSame');
    }

    user.changePassword(this.passwords.hash(command.newPassword));
    const saved = await this.users.save(user);

    await this.audit.record({
      action: 'PROFILE_CHANGE_PASSWORD',
      targetType: 'USER',
      targetId: user.id,
      after: { passwordChangedAt: saved.updatedAt },
    });
    return { changed: true };
  }
}
