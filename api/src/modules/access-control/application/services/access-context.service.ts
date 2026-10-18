import { Inject, Injectable } from '@nestjs/common';
import { AccessAssignment, AccessContextProvider, UserAccessContext } from '../../../../common/auth/access-context';
import { AssignmentType } from '../../domain/assignment-type.enum';
import { USER_ACCESS_REPOSITORY, UserAccessRepository } from '../ports/user-access.repository';
import { USER_DIRECTORY, UserDirectory } from '../ports/user-directory.repository';
import { appUnauthorized } from '../../../../common/i18n';

/**
 * Hiện thực của `ACCESS_CONTEXT_PROVIDER` mà `PermissionsGuard` dùng.
 * Cố tình **không cache**: quản trị viên sửa ma trận phân quyền là có hiệu lực ngay ở request kế
 * tiếp, không phải chờ người dùng đăng nhập lại (yêu cầu DoD mốc M1).
 */
@Injectable()
export class AccessContextService implements AccessContextProvider {
  constructor(
    @Inject(USER_ACCESS_REPOSITORY)
    private readonly userAccess: UserAccessRepository,
    @Inject(USER_DIRECTORY)
    private readonly users: UserDirectory,
  ) {}

  async loadForUser(userId: string): Promise<UserAccessContext> {
    const [user, snapshot] = await Promise.all([
      this.users.findById(userId),
      this.userAccess.loadSnapshot(userId),
    ]);
    if (!user) throw appUnauthorized('auth.unknownActor');
    if (user.status !== 'ACTIVE') {
      throw appUnauthorized(user.status === 'PENDING' ? 'auth.accountPending' : 'auth.accountLocked');
    }
    const assignments: AccessAssignment[] = snapshot.assignments.map((assignment) => ({
      type: assignment.type,
      value: assignment.value,
      label: assignment.label ?? undefined,
      organizationId: assignment.organizationId ?? undefined,
    }));

    if (user.taxCode) {
      const hasTaxCode = assignments.some(
        (a) => a.type === AssignmentType.TAX_CODE && a.value === user.taxCode,
      );
      if (!hasTaxCode) {
        assignments.push({
          type: AssignmentType.TAX_CODE,
          value: user.taxCode,
          label: user.displayName,
          organizationId: undefined,
        });
      }
    }

    if (user.idNumber) {
      const hasIdNumber = assignments.some(
        (a) => a.type === AssignmentType.ID_NUMBER && a.value === user.idNumber,
      );
      if (!hasIdNumber) {
        assignments.push({
          type: AssignmentType.ID_NUMBER,
          value: user.idNumber,
          label: user.displayName,
          organizationId: undefined,
        });
      }
    }

    return {
      userId,
      roles: snapshot.roles.map((role) => ({
        code: role.roleCode,
        name: role.roleName,
        dataScope: role.dataScope,
        organizationId: role.organizationId ?? undefined,
        organizationCode: role.organizationCode ?? undefined,
      })),
      permissions: snapshot.permissions,
      assignments,
    };
  }
}
