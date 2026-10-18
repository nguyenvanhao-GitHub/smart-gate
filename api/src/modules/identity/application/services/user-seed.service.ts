import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  ORGANIZATION_REPOSITORY,
  OrganizationRepository,
} from '../../../access-control/application/ports/organization.repository';
import {
  USER_ACCESS_REPOSITORY,
  UserAccessRepository,
} from '../../../access-control/application/ports/user-access.repository';
import { AccountType, UserAccount } from '../../domain/user.entity';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { USER_REPOSITORY, UserRepository } from '../ports/user.repository';
import { DEFAULT_ACCOUNT_SEEDS, DefaultAccountSeed } from './default-account-seed';
import { PasswordService } from './password.service';
import {
  isSelfRegisteredAccountType,
  selfRegisteredRoleCode,
  selfRegisteredRoleGrants,
} from './self-registered-role';

@Injectable()
export class UserSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UserSeedService.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(USER_ACCESS_REPOSITORY)
    private readonly userAccess: UserAccessRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    private readonly passwords: PasswordService,
  ) {}

  /**
   * Seed **theo từng tài khoản còn thiếu**, không phải kiểu "được ăn cả ngã về không".
   *
   * Trước đây chỉ seed khi bảng `users` rỗng. Hệ quả đã xảy ra thật: một lượt seed vỡ giữa chừng
   * (chèn được 19/21 rồi lỗi) khiến các lượt sau **bỏ qua toàn bộ** vì bảng không còn rỗng, và hai
   * tài khoản cuối không bao giờ được tạo. Thêm một vai trò mới vào danh sách seed cũng gặp đúng
   * vấn đề đó trên mọi môi trường đã có dữ liệu.
   *
   * Cách này idempotent: tài khoản nào **chưa có username** thì tạo, đã có thì không đụng tới
   * (không ghi đè mật khẩu hay hồ sơ mà quản trị đã sửa); vai trò RBAC chỉ được gán cho tài khoản
   * **chưa có vai trò nào** để không đè cấu hình quản trị viên đã chỉnh tay.
   */
  async onApplicationBootstrap(): Promise<void> {
    let created = 0;
    for (const seed of DEFAULT_ACCOUNT_SEEDS) {
      if (await this.users.findByUsername(seed.username)) continue;
      await this.users.save(
        UserAccount.create({
          ...seed,
          passwordHash: this.passwords.hash('123456'),
        }),
      );
      created += 1;
    }

    if (created > 0) {
      this.logger.log(`Seeded ${created} tài khoản mặc định còn thiếu cho Chiềng Khương.`);
    }
    await this.normalizeDefaultUsers();
    // Gán vai trò RBAC thẳng vào `user_roles` cho tài khoản chưa có vai trò nào (thay cho bước di
    // trú suy ngược từ cột `users.role` trước đây).
    await this.grantDefaultRoles();
    await this.normalizeExternalAccountRoles();
  }

  /**
   * Backfill idempotent cho dữ liệu đã tồn tại trước khi tách vai trò Cá nhân: DN phải có
   * ENTERPRISE/OWN, cá nhân phải có INDIVIDUAL/OWN. Đây cũng là chốt tự sửa dữ liệu bị gán sai.
   */
  private async normalizeExternalAccountRoles(): Promise<void> {
    let page = 1;
    let normalized = 0;
    for (;;) {
      const result = await this.users.findMany({ page, pageSize: 100 });
      if (result.items.length === 0) break;

      for (const user of result.items) {
        if (!isSelfRegisteredAccountType(user.accountType)) continue;
        const expectedCode = selfRegisteredRoleCode(user.accountType);
        const current = await this.userAccess.listRoles(user.id);
        const alreadyCorrect =
          current.length === 1 &&
          current[0].roleCode === expectedCode &&
          current[0].dataScope === DataScopeLevel.OWN;
        if (alreadyCorrect) continue;

        try {
          await this.userAccess.replaceRoles(user.id, selfRegisteredRoleGrants(user.accountType));
          normalized += 1;
        } catch (error) {
          this.logger.warn(`Không đồng bộ được vai trò cho tài khoản ${user.username}: ${(error as Error).message}`);
        }
      }

      if (page * result.pageSize >= result.total) break;
      page += 1;
    }
    if (normalized > 0) this.logger.log(`Đã đồng bộ vai trò tự động cho ${normalized} tài khoản DN/cá nhân.`);
  }

  private async normalizeDefaultUsers(): Promise<void> {
    for (const seed of DEFAULT_ACCOUNT_SEEDS) {
      const user = await this.users.findByUsername(seed.username);
      if (!user) continue;

      const updates: Partial<UserAccount> = {};

      if (seed.accountType !== undefined && user.accountType !== seed.accountType) {
        updates.accountType = seed.accountType;
      }

      // Xử lý riêng cho taxCode: tài khoản cá nhân (INDIVIDUAL) bắt buộc taxCode: null
      if (seed.accountType === AccountType.INDIVIDUAL) {
        if (user.taxCode !== null) updates.taxCode = null;
      } else if (seed.taxCode !== undefined && (!user.taxCode || /demo/i.test(user.taxCode))) {
        updates.taxCode = seed.taxCode;
      }

      if (seed.idNumber !== undefined && (!user.idNumber || /demo/i.test(user.idNumber))) {
        updates.idNumber = seed.idNumber;
      }
      if (seed.address !== undefined && (!user.address || /demo/i.test(user.address))) {
        updates.address = seed.address;
      }
      if (seed.representativeName !== undefined && (!user.representativeName || /demo/i.test(user.representativeName))) {
        updates.representativeName = seed.representativeName;
      }
      if (seed.phone !== undefined && (!user.phone || /demo/i.test(user.phone))) {
        updates.phone = seed.phone;
      }
      if (seed.displayName !== undefined && (!user.displayName || /demo/i.test(user.displayName))) {
        updates.displayName = seed.displayName;
      }
      if (seed.isProtected !== undefined && user.isProtected !== seed.isProtected) {
        updates.isProtected = seed.isProtected;
      }
      if (seed.defaultRoute !== undefined && user.defaultRoute !== seed.defaultRoute) {
        updates.defaultRoute = seed.defaultRoute;
      }

      if (Object.keys(updates).length > 0) {
        user.updateProfile(updates);
        await this.users.save(user);
      }

      // Đảm bảo phân công mặc định được cập nhật nếu danh sách phân công đang rỗng
      if (seed.assignments.length > 0) {
        const assignments = await this.userAccess.listAssignments(user.id);
        if (assignments.length === 0) {
          try {
            await this.userAccess.replaceAssignments(
              user.id,
              seed.assignments.map((assignment) => ({
                type: assignment.type,
                value: assignment.value,
                label: assignment.label,
                organizationCode: seed.organizationCode,
              })),
            );
          } catch (error) {
            this.logger.warn(`Không gán được phân công mặc định cho ${user.username}: ${(error as Error).message}`);
          }
        }
      }
    }
  }

  /** Ghi vai trò + phân công + đơn vị của tài khoản seed, chỉ khi tài khoản chưa có vai trò nào. */
  private async grantDefaultRoles(): Promise<void> {
    let granted = 0;
    for (const seed of DEFAULT_ACCOUNT_SEEDS) {
      const user = await this.users.findByUsername(seed.username);
      if (!user) continue;
      if ((await this.userAccess.countRoles(user.id)) > 0) continue;

      try {
        await this.userAccess.replaceRoles(
          user.id,
          seed.roles.map((role) => ({
            roleCode: role.code,
            dataScope: role.dataScope,
            organizationCode: seed.organizationCode,
          })),
        );
        await this.userAccess.replaceAssignments(
          user.id,
          seed.assignments.map((assignment) => ({
            type: assignment.type,
            value: assignment.value,
            label: assignment.label,
            organizationCode: seed.organizationCode,
          })),
        );
        await this.attachOrganization(user, seed);
        granted += 1;
      } catch (error) {
        // Không để một tài khoản lỗi làm hỏng cả quá trình khởi động; lần khởi động sau sẽ thử lại.
        this.logger.warn(`Không gán được phân quyền cho tài khoản ${user.username}: ${(error as Error).message}`);
      }
    }

    if (granted > 0) this.logger.log(`Đã gán vai trò RBAC cho ${granted} tài khoản mặc định.`);
  }

  private async attachOrganization(user: UserAccount, seed: DefaultAccountSeed): Promise<void> {
    if (user.organizationId) return;
    const organization = await this.organizations.findByCode(seed.organizationCode);
    if (!organization) return;
    user.updateProfile({ organizationId: organization.id });
    await this.users.save(user);
  }
}
