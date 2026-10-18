import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import {
  USER_ACCESS_REPOSITORY,
  UserAccessRepository,
} from '../../../access-control/application/ports/user-access.repository';
import { UserStatus } from '../../domain/user.entity';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { PublicUserDto } from '../dto/public-user.dto';
import { USER_REPOSITORY, UserRepository } from '../ports/user.repository';
import { UserViewAssembler } from '../services/user-view.assembler';
import {
  isSelfRegisteredAccountType,
  selfRegisteredRoleCode,
  selfRegisteredRoleGrants,
} from '../services/self-registered-role';
import { appConflict, appNotFound } from '../../../../common/i18n';

/**
 * F00 — Duyệt tài khoản tự đăng ký: `PENDING` → `ACTIVE`.
 *
 * Chỉ duyệt được tài khoản đang chờ; tài khoản `ACTIVE`/`LOCKED` bị chặn 409 để không lẫn với thao
 * tác mở khóa (dùng `unlock`). Với tài khoản tự đăng ký (DN/cá nhân) **chưa có vai trò**, tự gán vai
 * đúng theo loại tài khoản (phạm vi `OWN`) để duyệt xong dùng được ngay — không phải chờ admin gán tay.
 */
@Injectable()
export class ApproveUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(USER_ACCESS_REPOSITORY)
    private readonly userAccess: UserAccessRepository,
    private readonly assembler: UserViewAssembler,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(userId: string): Promise<PublicUserDto> {
    const user = await this.users.findById(userId);
    if (!user) throw appNotFound('user.notFound');
    if (user.status !== UserStatus.PENDING) throw appConflict('user.notPending');

    const before = { status: user.status };
    user.approve();
    const saved = await this.users.save(user);

    // Đồng bộ bất biến vai trò theo loại tài khoản; sửa luôn dữ liệu PENDING cũ hoặc từng bị gán sai.
    let grantedRole: string | null = null;
    if (isSelfRegisteredAccountType(saved.accountType)) {
      const existingRoles = await this.userAccess.listRoles(saved.id);
      const expectedRole = selfRegisteredRoleCode(saved.accountType);
      const alreadyCorrect =
        existingRoles.length === 1 &&
        existingRoles[0].roleCode === expectedRole &&
        existingRoles[0].dataScope === DataScopeLevel.OWN;
      if (!alreadyCorrect) {
        await this.userAccess.replaceRoles(saved.id, selfRegisteredRoleGrants(saved.accountType));
        grantedRole = expectedRole;
      }
    }

    await this.audit.record({
      action: 'USER_APPROVE',
      targetType: 'USER',
      targetId: user.id,
      before,
      // Ghi kèm vai trò tự gán vào bản ghi USER_APPROVE để không nhân đôi bản ghi audit.
      after: { status: saved.status, grantedRole },
    });
    return this.assembler.assemble(saved);
  }
}
