import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { PublicUserDto } from '../dto/public-user.dto';
import { UpdateProfileCommand } from '../dto/update-profile.command';
import { USER_REPOSITORY, UserRepository } from '../ports/user.repository';
import { UserViewAssembler } from '../services/user-view.assembler';
import { appNotFound } from '../../../../common/i18n';

/** Hồ sơ cá nhân (F01): người dùng chỉ sửa được thông tin liên hệ của chính mình, không đổi vai trò. */
@Injectable()
export class UpdateProfileUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly assembler: UserViewAssembler,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: UpdateProfileCommand): Promise<PublicUserDto> {
    const user = await this.users.findById(command.userId);
    if (!user) throw appNotFound('auth.accountNotFound');

    const cleanNullable = (value: string | null | undefined): string | null | undefined => {
      if (value === undefined) return undefined;
      const trimmed = value?.trim() ?? '';
      return trimmed.length > 0 ? trimmed : null;
    };
    const before = {
      displayName: user.displayName,
      title: user.title,
      email: user.email,
      phone: user.phone,
      address: user.address,
      representativeName: user.representativeName,
      avatarUrl: user.avatarUrl,
    };
    user.updateProfile({
      displayName: command.displayName?.trim(),
      title: command.title?.trim(),
      email: cleanNullable(command.email),
      phone: cleanNullable(command.phone),
      address: cleanNullable(command.address),
      representativeName: cleanNullable(command.representativeName),
      avatarUrl: command.avatarUrl !== undefined ? cleanNullable(command.avatarUrl) : undefined,
    });
    const saved = await this.users.save(user);

    await this.audit.record({
      action: 'PROFILE_UPDATE',
      targetType: 'USER',
      targetId: user.id,
      before,
      after: {
        displayName: saved.displayName,
        title: saved.title,
        email: saved.email,
        phone: saved.phone,
        address: saved.address,
        representativeName: saved.representativeName,
        avatarUrl: saved.avatarUrl,
      },
    });
    return this.assembler.assemble(saved);
  }
}
