import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
// Đọc trực tiếp bảng `users` của phân hệ identity: giữ chiều phụ thuộc identity → access-control,
// nếu inject ngược UserRepository sẽ tạo vòng lặp module (identity cần USER_ACCESS_REPOSITORY).
import { UserOrmEntity } from '../../../identity/infrastructure/persistence/user.orm-entity';
import { UserStatus } from '../../../identity/domain/user.entity';
import { DirectoryUser, UserDirectory } from '../../application/ports/user-directory.repository';
import { AssignmentType } from '../../domain/assignment-type.enum';
import { WORKFLOW_STEP_ROLE_CATALOG } from '../../domain/workflow-step-role.catalog';
import { RoleOrmEntity } from './role.orm-entity';
import { UserAssignmentOrmEntity } from './user-assignment.orm-entity';
import { UserRoleOrmEntity } from './user-role.orm-entity';
import { WorkflowStepRoleOrmEntity } from './workflow-step-role.orm-entity';

@Injectable()
export class TypeOrmUserDirectory implements UserDirectory {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly users: Repository<UserOrmEntity>,
    @InjectRepository(UserAssignmentOrmEntity)
    private readonly assignments: Repository<UserAssignmentOrmEntity>,
    @InjectRepository(UserRoleOrmEntity)
    private readonly userRoles: Repository<UserRoleOrmEntity>,
    @InjectRepository(RoleOrmEntity)
    private readonly roles: Repository<RoleOrmEntity>,
    @InjectRepository(WorkflowStepRoleOrmEntity)
    private readonly stepRoles: Repository<WorkflowStepRoleOrmEntity>,
  ) {}

  async findById(userId: string): Promise<DirectoryUser | null> {
    const row = await this.users.findOne({ where: { id: userId } });
    return row ? TypeOrmUserDirectory.toDirectoryUser(row) : null;
  }

  async findAll(): Promise<DirectoryUser[]> {
    const rows = await this.users.find({ order: { createdAt: 'ASC' } });
    return rows.map((row) => TypeOrmUserDirectory.toDirectoryUser(row));
  }

  async setOrganization(userId: string, organizationId: string): Promise<void> {
    await this.users.update({ id: userId }, { organizationId });
  }

  async findIdsByTaxCode(taxCode: string): Promise<string[]> {
    const [rows, userRows] = await Promise.all([
      this.assignments.find({
        where: { type: AssignmentType.TAX_CODE, value: taxCode, isActive: true },
      }),
      this.users.find({
        where: { taxCode, status: UserStatus.ACTIVE },
      }),
    ]);
    return [...new Set([...rows.map((row) => row.userId), ...userRows.map((row) => row.id)])];
  }

  async findIdsByRoleCode(roleCode: string): Promise<string[]> {
    const role = await this.roles.findOne({ where: { code: roleCode } });
    if (!role) return [];
    const rows = await this.userRoles.find({ where: { roleId: role.id } });
    return [...new Set(rows.map((row) => row.userId))];
  }

  async findIdsByRoleCodes(roleCodes: string[]): Promise<string[]> {
    if (!roleCodes.length) return [];
    const roles = await this.roles.find({
      where: { code: In(roleCodes), isActive: true },
    });
    if (!roles.length) return [];
    const roleIds = roles.map((r) => r.id);
    const userRoles = await this.userRoles.find({
      where: { roleId: In(roleIds) },
    });
    return [...new Set(userRoles.map((ur) => ur.userId))];
  }

  async findIdsByStepCode(stepCode: string): Promise<string[]> {
    const stepRoleRows = await this.stepRoles.find({
      where: { stepCode, isActive: true },
    });
    let roleIds: string[] = [];
    if (stepRoleRows.length) {
      roleIds = stepRoleRows.map((r) => r.roleId);
    } else {
      const catalogRoles = WORKFLOW_STEP_ROLE_CATALOG.filter((item) => item.stepCode === stepCode).map(
        (item) => item.roleCode,
      );
      if (catalogRoles.length) {
        const roles = await this.roles.find({
          where: { code: In(catalogRoles), isActive: true },
        });
        roleIds = roles.map((r) => r.id);
      }
    }
    if (!roleIds.length) return [];
    const userRoles = await this.userRoles.find({
      where: { roleId: In(roleIds) },
    });
    return [...new Set(userRoles.map((ur) => ur.userId))];
  }

  private static toDirectoryUser(row: UserOrmEntity): DirectoryUser {
    return {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      title: row.title,
      email: row.email ?? null,
      phone: row.phone ?? null,
      address: row.address ?? null,
      status: row.status,
      organizationId: row.organizationId ?? null,
      accountType: row.accountType ?? null,
      taxCode: row.taxCode ?? null,
      idNumber: row.idNumber ?? null,
      representativeName: row.representativeName ?? null,
      avatarUrl: row.avatarUrl ?? null,
    };
  }
}
