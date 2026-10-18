import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import {
  USER_ACCESS_REPOSITORY,
  UserAccessRepository,
} from '../../../access-control/application/ports/user-access.repository';
import { ASSIGNMENT_TYPE_LABELS } from '../../../access-control/domain/assignment-type.enum';
import { PublicUserAssignmentDto } from '../dto/public-user.dto';
import { ReplaceUserAssignmentsCommand } from '../dto/replace-user-access.command';
import { USER_REPOSITORY, UserRepository } from '../ports/user.repository';
import { appNotFound } from '../../../../common/i18n';

/** Gán lại phạm vi làm việc: cửa khẩu, chốt B1/B2/B5, bãi, loại kiểm dịch, mã số thuế doanh nghiệp. */
@Injectable()
export class ReplaceUserAssignmentsUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(USER_ACCESS_REPOSITORY)
    private readonly userAccess: UserAccessRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: ReplaceUserAssignmentsCommand): Promise<PublicUserAssignmentDto[]> {
    const user = await this.users.findById(command.userId);
    if (!user) throw appNotFound('user.notFound');

    const before = await this.userAccess.listAssignments(command.userId);
    const after = await this.userAccess.replaceAssignments(
      command.userId,
      command.assignments.map((assignment) => ({
        type: assignment.type,
        value: assignment.code,
        label: ASSIGNMENT_TYPE_LABELS[assignment.type] ?? null,
      })),
    );

    await this.audit.record({
      action: 'USER_ASSIGNMENTS_REPLACE',
      targetType: 'USER',
      targetId: command.userId,
      before: {
        username: user.username,
        displayName: user.displayName,
        assignments: before.map((item) => `${item.type}:${item.value}`),
      },
      after: {
        username: user.username,
        displayName: user.displayName,
        assignments: after.map((item) => `${item.type}:${item.value}`),
      },
    });

    // Trả đúng shape `assignments` của `/access-control/me` — xem PublicUserAssignmentDto.
    return after.map((item) => ({
      type: item.type,
      code: item.value,
      name: item.label || ASSIGNMENT_TYPE_LABELS[item.type] || item.type,
    }));
  }
}
