import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { PublicUserDto } from '../dto/public-user.dto';
import { USER_REPOSITORY, UserRepository } from '../ports/user.repository';
import { UserViewAssembler } from '../services/user-view.assembler';
import { appBadRequest, appNotFound } from '../../../../common/i18n';

/** Khóa tài khoản — F03 bắt buộc nhập lý do, đúng như modal khóa của mockup UI-13. */
@Injectable()
export class LockUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly assembler: UserViewAssembler,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(userId: string, reason: string, actorId: string): Promise<PublicUserDto> {
    if (!reason?.trim()) throw appBadRequest('user.lockReasonRequired');

    const user = await this.users.findById(userId);
    if (!user) throw appNotFound('user.notFound');
    if (user.id === actorId) throw appBadRequest('user.cannotLockSelf');

    const before = { status: user.status, lockReason: user.lockReason };
    user.lock(reason.trim());
    const saved = await this.users.save(user);

    await this.audit.record({
      action: 'USER_LOCK',
      targetType: 'USER',
      targetId: user.id,
      before: { username: user.username, displayName: user.displayName, ...before },
      after: { username: saved.username, displayName: saved.displayName, status: saved.status, lockReason: saved.lockReason },
    });
    return this.assembler.assemble(saved);
  }
}
