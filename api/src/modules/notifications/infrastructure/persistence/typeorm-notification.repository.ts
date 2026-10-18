import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { PaginatedResult, normalizePaging, toPaginatedResult } from '../../../../common/http/pagination';
import {
  NotificationRepository,
  NotificationSearchCriteria,
} from '../../application/ports/notification.repository';
import { Notification } from '../../domain/notification.entity';
import { NotificationMapper } from './notification.mapper';
import { NotificationOrmEntity } from './notification.orm-entity';

@Injectable()
export class TypeOrmNotificationRepository implements NotificationRepository {
  constructor(
    @InjectRepository(NotificationOrmEntity)
    private readonly repository: Repository<NotificationOrmEntity>,
  ) {}

  async saveMany(notifications: Notification[]): Promise<void> {
    if (notifications.length === 0) return;
    await this.repository.save(notifications.map((item) => NotificationMapper.toPersistence(item)));
  }

  async findMany(criteria: NotificationSearchCriteria): Promise<PaginatedResult<Notification>> {
    const paging = normalizePaging(criteria.page, criteria.pageSize);
    const query = this.repository
      .createQueryBuilder('notification')
      .where('notification.recipientId = :recipientId', { recipientId: criteria.recipientId })
      .orderBy('notification.createdAt', 'DESC');
    if (criteria.unreadOnly) query.andWhere('notification.readAt IS NULL');

    const [rows, total] = await query.skip(paging.skip).take(paging.take).getManyAndCount();
    return toPaginatedResult(rows.map((row) => NotificationMapper.toDomain(row)), total, paging);
  }

  async findById(id: string): Promise<Notification | null> {
    const row = await this.repository.findOne({ where: { id } });
    return row ? NotificationMapper.toDomain(row) : null;
  }

  async save(notification: Notification): Promise<void> {
    await this.repository.save(NotificationMapper.toPersistence(notification));
  }

  countUnread(recipientId: string): Promise<number> {
    return this.repository.count({ where: { recipientId, readAt: IsNull() } });
  }

  async markAllRead(recipientId: string, at: Date): Promise<number> {
    const result = await this.repository.update({ recipientId, readAt: IsNull() }, { readAt: at });
    return result.affected || 0;
  }
}
