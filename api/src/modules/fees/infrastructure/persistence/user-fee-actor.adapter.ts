import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserOrmEntity } from '../../../identity/infrastructure/persistence/user.orm-entity';
import { FeeActor, FeeActorDirectory } from '../../application/ports/fee-actor.port';

/**
 * Đọc tên hiển thị của tài khoản. Khai `UserOrmEntity` trực tiếp thay vì import `IdentityModule`
 * để không tạo vòng phụ thuộc — cùng cách `workflow` đang dùng.
 */
@Injectable()
export class UserFeeActorAdapter implements FeeActorDirectory {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly users: Repository<UserOrmEntity>,
  ) {}

  async findById(userId: string): Promise<FeeActor | null> {
    const row = await this.users.findOne({ where: { id: userId } });
    return row ? { id: row.id, fullName: row.displayName } : null;
  }
}
