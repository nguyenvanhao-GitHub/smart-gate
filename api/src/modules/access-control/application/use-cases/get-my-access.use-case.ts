import { Inject, Injectable } from '@nestjs/common';
import { AccessAssignmentDto, AccessMenuItemDto, MyAccessDto } from '../dto/access-view.dto';
import { ASSIGNMENT_TYPE_LABELS, AssignmentType } from '../../domain/assignment-type.enum';
import { MENU_CATALOG } from '../../domain/menu.catalog';
import { ORGANIZATION_REPOSITORY, OrganizationRepository } from '../ports/organization.repository';
import { USER_ACCESS_REPOSITORY, UserAccessRepository } from '../ports/user-access.repository';
import { USER_DIRECTORY, UserDirectory } from '../ports/user-directory.repository';
import { appNotFound } from '../../../../common/i18n';

/**
 * Gộp hồ sơ tài khoản + vai trò + quyền + phân công + menu cho một lần gọi sau đăng nhập.
 * Web dùng đúng kết quả này để dựng sidebar và ẩn/hiện nút, không tự suy diễn theo mã vai trò nữa.
 */
@Injectable()
export class GetMyAccessUseCase {
  constructor(
    @Inject(USER_DIRECTORY)
    private readonly users: UserDirectory,
    @Inject(USER_ACCESS_REPOSITORY)
    private readonly userAccess: UserAccessRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
  ) {}

  async execute(userId: string): Promise<MyAccessDto> {
    const user = await this.users.findById(userId);
    if (!user) throw appNotFound('auth.accountNotFound');

    const snapshot = await this.userAccess.loadSnapshot(userId);
    // Bảng đơn vị chỉ vài chục bản ghi nên nạp cả bảng rẻ hơn thêm một cổng truy vấn theo id.
    const organizations = await this.organizations.findAll();
    const organization = organizations.find((item) => item.id === user.organizationId) || null;

    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        title: user.title,
        email: user.email,
        phone: user.phone,
        address: user.address,
        accountType: user.accountType,
        taxCode: user.taxCode,
        idNumber: user.idNumber,
        representativeName: user.representativeName,
        avatarUrl: user.avatarUrl,
        status: user.status,
        organization: organization ? { id: organization.id, code: organization.code, name: organization.name } : null,
      },
      roles: snapshot.roles.map((role) => ({ code: role.roleCode, name: role.roleName, dataScope: role.dataScope })),
      permissions: snapshot.permissions,
      assignments: snapshot.assignments.map((assignment) => this.toAssignmentDto(assignment.type, assignment.value, assignment.label)),
      menu: this.buildMenu(snapshot.permissions),
    };
  }

  private toAssignmentDto(type: AssignmentType, value: string, label: string | null): AccessAssignmentDto {
    return { type, code: value, name: label || ASSIGNMENT_TYPE_LABELS[type] || type };
  }

  /** Menu suy ra từ quyền: mục nào không có quyền tối thiểu thì không trả về. Đệ quy cả menu con. */
  private buildMenu(permissions: string[], items = MENU_CATALOG): AccessMenuItemDto[] {
    return items
      .filter((item) => permissions.includes(item.permission))
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => {
        const children = item.children ? this.buildMenu(permissions, item.children) : [];
        return {
          key: item.code,
          label: item.label,
          icon: item.icon,
          route: item.route,
          ...(children.length ? { children } : {}),
        };
      });
  }
}
