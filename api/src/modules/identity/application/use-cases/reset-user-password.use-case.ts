import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { PublicUserDto } from '../dto/public-user.dto';
import { USER_REPOSITORY, UserRepository } from '../ports/user.repository';
import { PasswordService } from '../services/password.service';
import { UserViewAssembler } from '../services/user-view.assembler';
import { appNotFound } from '../../../../common/i18n';

@Injectable()
export class ResetUserPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly assembler: UserViewAssembler,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(userId: string, newPassword: string): Promise<PublicUserDto> {
    const user = await this.users.findById(userId);
    if (!user) throw appNotFound('user.notFound');

    user.changePassword(this.passwords.hash(newPassword));
    const saved = await this.users.save(user);

    // Không bao giờ ghi mật khẩu (kể cả hash) vào nhật ký kiểm toán.
    await this.audit.record({
      action: 'USER_RESET_PASSWORD',
      targetType: 'USER',
      targetId: user.id,
      after: { username: user.username, displayName: user.displayName, passwordChangedAt: saved.updatedAt },
    });
    return this.assembler.assemble(saved);
  }
}
