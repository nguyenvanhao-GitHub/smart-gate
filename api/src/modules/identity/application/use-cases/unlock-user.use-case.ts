import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { PublicUserDto } from '../dto/public-user.dto';
import { USER_REPOSITORY, UserRepository } from '../ports/user.repository';
import { UserViewAssembler } from '../services/user-view.assembler';
import { appNotFound } from '../../../../common/i18n';

@Injectable()
export class UnlockUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly assembler: UserViewAssembler,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(userId: string): Promise<PublicUserDto> {
    const user = await this.users.findById(userId);
    if (!user) throw appNotFound('user.notFound');

    const before = { status: user.status, lockReason: user.lockReason };
    user.unlock();
    const saved = await this.users.save(user);

    await this.audit.record({
      action: 'USER_UNLOCK',
      targetType: 'USER',
      targetId: user.id,
      before: { username: user.username, displayName: user.displayName, ...before },
      after: { username: saved.username, displayName: saved.displayName, status: saved.status, lockReason: saved.lockReason },
    });
    return this.assembler.assemble(saved);
  }
}
