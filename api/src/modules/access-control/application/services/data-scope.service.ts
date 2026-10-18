import { Injectable } from '@nestjs/common';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { AssignmentType } from '../../domain/assignment-type.enum';
import { DATA_SCOPE_WIDTH, DataScopeLevel } from '../../domain/data-scope.enum';

/**
 * Điều kiện lọc dữ liệu suy ra từ phạm vi (`data_scope`) của người dùng.
 * Use-case nhận đối tượng này và tự dịch sang điều kiện truy vấn của repository tương ứng.
 */
export interface DataScopeFilter {
  /** Phạm vi rộng nhất trong các vai trò được gán. */
  level: DataScopeLevel;
  /** True thì không chèn thêm điều kiện nào. */
  unrestricted: boolean;
  /** Tài khoản hiện tại — dùng cho phạm vi OWN. */
  ownerUserId: string;
  /** Đơn vị của người dùng (kể cả đơn vị con khi đã dựng cây) — phạm vi ORGANIZATION. */
  organizationIds: string[];
  /** Mã số thuế doanh nghiệp được phân công — phạm vi OWN. */
  taxCodes: string[];
  /** CCCD / Số giấy tờ cá nhân — phạm vi OWN. */
  idNumbers: string[];
  /** Chốt/cổng/bãi được phân công — phạm vi ASSIGNMENT. */
  checkpoints: string[];
}

@Injectable()
export class DataScopeService {
  /** Phạm vi hiệu lực = rộng nhất trong các vai trò (người nhiều vai trò không bị bó theo vai hẹp nhất). */
  effectiveLevel(access: UserAccessContext): DataScopeLevel {
    if (access.roles.length === 0) return DataScopeLevel.OWN;
    return access.roles.reduce(
      (widest, role) => (DATA_SCOPE_WIDTH[role.dataScope] > DATA_SCOPE_WIDTH[widest] ? role.dataScope : widest),
      access.roles[0].dataScope,
    );
  }

  resolve(access: UserAccessContext): DataScopeFilter {
    const level = this.effectiveLevel(access);
    return {
      level,
      unrestricted: level === DataScopeLevel.ALL,
      ownerUserId: access.userId,
      organizationIds: [
        ...new Set(
          access.roles.map((role) => role.organizationId).filter((id): id is string => !!id),
        ),
      ],
      taxCodes: this.assignmentValues(access, AssignmentType.TAX_CODE),
      idNumbers: this.assignmentValues(access, AssignmentType.ID_NUMBER),
      checkpoints: this.assignmentValues(access, AssignmentType.CHECKPOINT),
    };
  }

  private assignmentValues(access: UserAccessContext, type: AssignmentType): string[] {
    return [...new Set(access.assignments.filter((item) => item.type === type).map((item) => item.value))];
  }
}
