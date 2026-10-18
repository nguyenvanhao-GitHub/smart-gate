import { UserAccount } from '../../domain/user.entity';
import { UserOrmEntity } from './user.orm-entity';

export class UserMapper {
  static toDomain(row: UserOrmEntity): UserAccount {
    return new UserAccount(
      row.id,
      row.username,
      row.passwordHash,
      row.displayName,
      row.title,
      row.defaultRoute,
      row.status,
      row.createdAt,
      row.updatedAt,
      row.email ?? null,
      row.phone ?? null,
      row.organizationId ?? null,
      row.lockReason ?? null,
      row.lastLoginAt ?? null,
      row.accountType ?? null,
      row.taxCode ?? null,
      row.idNumber ?? null,
      row.address ?? null,
      row.representativeName ?? null,
      row.avatarUrl ?? null,
      row.isProtected ?? false,
    );
  }

  static toPersistence(user: UserAccount): UserOrmEntity {
    const row = new UserOrmEntity();
    row.id = user.id;
    row.username = user.username;
    row.passwordHash = user.passwordHash;
    row.displayName = user.displayName;
    row.title = user.title;
    row.email = user.email;
    row.phone = user.phone;
    row.defaultRoute = user.defaultRoute;
    row.organizationId = user.organizationId;
    row.status = user.status;
    row.accountType = user.accountType;
    row.taxCode = user.taxCode;
    row.idNumber = user.idNumber;
    row.address = user.address;
    row.representativeName = user.representativeName;
    row.avatarUrl = user.avatarUrl;
    row.isProtected = user.isProtected ?? false;
    row.lockReason = user.lockReason;
    row.lastLoginAt = user.lastLoginAt;
    row.createdAt = user.createdAt;
    row.updatedAt = user.updatedAt;
    return row;
  }
}
