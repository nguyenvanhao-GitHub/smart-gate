import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { PaginatedResult, normalizePaging, toPaginatedResult } from '../../../../common/http/pagination';
import { UserRepository, UserSearchCriteria } from '../../application/ports/user.repository';
import { UserAccount, UserStatus } from '../../domain/user.entity';
import { UserMapper } from './user.mapper';
import { UserOrmEntity } from './user.orm-entity';

@Injectable()
export class TypeOrmUserRepository implements UserRepository {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly repository: Repository<UserOrmEntity>,
  ) {}

  count(): Promise<number> {
    return this.repository.count();
  }

  async findMany(criteria: UserSearchCriteria): Promise<PaginatedResult<UserAccount>> {
    const paging = normalizePaging(criteria.page, criteria.pageSize);
    // SG-289: Ưu tiên tài khoản Chờ duyệt (PENDING) lên đầu danh sách; trong từng nhóm sắp xếp theo thời gian tạo mới nhất (createdAt DESC).
    const query = this.repository
      .createQueryBuilder('user')
      .orderBy(`CASE WHEN user.status = '${UserStatus.PENDING}' THEN 0 ELSE 1 END`, 'ASC')
      .addOrderBy('user.createdAt', 'DESC')
      .addOrderBy('user.id', 'DESC');
    if (criteria.roleCode) {
      // Lọc theo vai trò RBAC trong `user_roles`, không phải cột `users.role` cũ.
      query.andWhere(
        `EXISTS (
           SELECT 1 FROM "user_roles" ur
           INNER JOIN "roles" r ON r."id" = ur."role_id"
           WHERE ur."user_id" = user.id AND r."code" = :roleCode
         )`,
        { roleCode: criteria.roleCode },
      );
    }
    if (criteria.status) query.andWhere('user.status = :status', { status: criteria.status });
    if (criteria.organizationId) {
      query.andWhere('user.organizationId = :organizationId', { organizationId: criteria.organizationId });
    }
    if (criteria.keyword) {
      const keyword = `%${criteria.keyword.trim()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('user.username ILIKE :keyword', { keyword })
            .orWhere('user.displayName ILIKE :keyword', { keyword })
            .orWhere('user.title ILIKE :keyword', { keyword })
            .orWhere('user.email ILIKE :keyword', { keyword })
            .orWhere('user.phone ILIKE :keyword', { keyword });
        }),
      );
    }

    const [rows, total] = await query.skip(paging.skip).take(paging.take).getManyAndCount();
    return toPaginatedResult(rows.map((row) => UserMapper.toDomain(row)), total, paging);
  }

  async findById(id: string): Promise<UserAccount | null> {
    const row = await this.repository.findOne({ where: { id } });
    return row ? UserMapper.toDomain(row) : null;
  }

  async findByUsername(username: string): Promise<UserAccount | null> {
    const row = await this.repository.findOne({ where: { username } });
    return row ? UserMapper.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<UserAccount | null> {
    if (!email) return null;
    const trimmed = email.trim();
    const row = await this.repository
      .createQueryBuilder('user')
      .where('user.email ILIKE :email', { email: trimmed })
      .orWhere('user.username ILIKE :email', { email: trimmed })
      .getOne();
    return row ? UserMapper.toDomain(row) : null;
  }

  async findByPhone(phone: string): Promise<UserAccount | null> {
    if (!phone) return null;
    const row = await this.repository.findOne({ where: { phone } });
    return row ? UserMapper.toDomain(row) : null;
  }

  async findByTaxCode(taxCode: string): Promise<UserAccount | null> {
    if (!taxCode) return null;
    const row = await this.repository.findOne({ where: { taxCode } });
    return row ? UserMapper.toDomain(row) : null;
  }

  async findByIdNumber(idNumber: string): Promise<UserAccount | null> {
    if (!idNumber) return null;
    const row = await this.repository.findOne({ where: { idNumber } });
    return row ? UserMapper.toDomain(row) : null;
  }

  async save(user: UserAccount): Promise<UserAccount> {
    const saved = await this.repository.save(UserMapper.toPersistence(user));
    return UserMapper.toDomain(saved);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
