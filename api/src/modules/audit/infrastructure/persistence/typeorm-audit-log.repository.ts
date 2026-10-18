import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { PaginatedResult, normalizePaging, toPaginatedResult } from '../../../../common/http/pagination';
import { vietnamDayEnd, vietnamDayStart } from '../../../../common/time/vietnam-date';
import { AuditLogRepository, AuditLogSearchCriteria } from '../../application/ports/audit-log.repository';
import {
  AUDIT_KNOWN_TARGET_TYPES,
  AUDIT_MODULE_ACTION_PREFIX,
  AUDIT_MODULE_TARGET_TYPES,
  AuditModuleCode,
} from '../../domain/audit-module';
import { AuditLog } from '../../domain/audit-log.entity';
import { AuditLogMapper } from './audit-log.mapper';
import { AuditLogOrmEntity } from './audit-log.orm-entity';

@Injectable()
export class TypeOrmAuditLogRepository implements AuditLogRepository {
  constructor(
    @InjectRepository(AuditLogOrmEntity)
    private readonly repository: Repository<AuditLogOrmEntity>,
  ) {}

  async save(entry: AuditLog): Promise<void> {
    await this.repository.save(AuditLogMapper.toPersistence(entry));
  }

  async findMany(criteria: AuditLogSearchCriteria): Promise<PaginatedResult<AuditLog>> {
    const paging = normalizePaging(criteria.page, criteria.pageSize);
    const query = this.repository.createQueryBuilder('log').orderBy('log.at', 'DESC');

    if (criteria.actor) {
      const actor = `%${criteria.actor.trim()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('CAST(log.actor_id AS TEXT) ILIKE :actor', { actor })
            .orWhere('log.actor_username ILIKE :actor', { actor })
            .orWhere('log.actor_role ILIKE :actor', { actor })
            .orWhere(
              `EXISTS (
                 SELECT 1 FROM users u
                 WHERE (u.id = log.actor_id OR u.username = log.actor_username)
                   AND (u.username ILIKE :actor OR u."displayName" ILIKE :actor OR u.title ILIKE :actor)
               )`,
              { actor },
            )
            .orWhere(
              `EXISTS (
                 SELECT 1 FROM roles r
                 WHERE r.code = log.actor_role
                   AND (r.name ILIKE :actor OR r.code ILIKE :actor)
               )`,
              { actor },
            );
        }),
      );
    }
    if (criteria.action) {
      const action = `%${criteria.action.trim()}%`;
      query.andWhere('log.action ILIKE :action', { action });
    }
    if (criteria.actions?.length) query.andWhere('log.action IN (:...actions)', { actions: criteria.actions });
    if (criteria.module) this.applyModuleFilter(query, criteria.module);
    if (criteria.targetIds?.length) {
      const targetIds = criteria.targetIds.map((id) => id.trim()).filter(Boolean);
      if (targetIds.length > 0) {
        query.andWhere(
          new Brackets((qb) => {
            qb.where('log.targetId IN (:...targetIds)', { targetIds })
              .orWhere("log.value_after->>'code' IN (:...targetIds)", { targetIds })
              .orWhere("log.value_before->>'code' IN (:...targetIds)", { targetIds })
              .orWhere("log.value_after->>'plateNumber' IN (:...targetIds)", { targetIds })
              .orWhere("log.value_before->>'plateNumber' IN (:...targetIds)", { targetIds })
              .orWhere("log.value_after->>'plate' IN (:...targetIds)", { targetIds })
              .orWhere("log.value_before->>'plate' IN (:...targetIds)", { targetIds });
          }),
        );
      }
    } else if (criteria.targetId?.trim()) {
      const targetId = criteria.targetId.trim();
      query.andWhere(
        new Brackets((qb) => {
          qb.where('log.targetId = :targetId', { targetId })
            .orWhere("log.value_after->>'code' = :targetId", { targetId })
            .orWhere("log.value_before->>'code' = :targetId", { targetId });
        }),
      );
    }
    if (criteria.target) {
      const target = `%${criteria.target.trim()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('log.targetType ILIKE :target', { target })
            .orWhere('CAST(log.targetId AS TEXT) ILIKE :target', { target })
            .orWhere("CAST(log.value_after->>'code' AS TEXT) ILIKE :target", { target })
            .orWhere("CAST(log.value_before->>'code' AS TEXT) ILIKE :target", { target });
        }),
      );
    }
    // Khoảng ngày bao trùm **cả hai đầu mút theo ngày dương lịch giờ VN** (BUG-025): biên dưới là đầu
    // ngày VN, biên trên là cuối ngày VN (23:59:59.999). Cắt thẳng bằng mốc 00:00 UTC loại nhầm trọn
    // ngày kết thúc và lệch múi giờ với dữ liệu hiển thị (Asia/Ho_Chi_Minh).
    if (criteria.from) query.andWhere('log.at >= :from', { from: vietnamDayStart(criteria.from) });
    if (criteria.to) query.andWhere('log.at <= :to', { to: vietnamDayEnd(criteria.to) });

    const [rows, total] = await query.skip(paging.skip).take(paging.take).getManyAndCount();
    return toPaginatedResult(rows.map((row) => AuditLogMapper.toDomain(row)), total, paging);
  }

  /**
   * Áp bộ lọc phân hệ (F05, BUG-051) — nhật ký không có cột phân hệ nên dựng điều kiện SQL mô phỏng đúng
   * `auditModuleOf` phía web: tiền tố `action` (`FEE_`/`AUTH_`) xét trước, còn lại theo `targetType`.
   * Dùng `LEFT(action, n)` (không phải `LIKE 'FEE_%'`) để `_` không bị hiểu là ký tự đại diện. Tính đủ
   * trên toàn tập ở tầng máy chủ nên `total`/phân trang khớp bảng đang xem.
   */
  private applyModuleFilter(query: SelectQueryBuilder<AuditLogOrmEntity>, module: AuditModuleCode): void {
    const isFee = `LEFT(log.action, ${AUDIT_MODULE_ACTION_PREFIX.FEE.length}) = '${AUDIT_MODULE_ACTION_PREFIX.FEE}'`;
    const isAuth = `LEFT(log.action, ${AUDIT_MODULE_ACTION_PREFIX.AUTH.length}) = '${AUDIT_MODULE_ACTION_PREFIX.AUTH}'`;
    const noPrefix = `NOT (${isFee}) AND NOT (${isAuth})`;

    switch (module) {
      case 'FEE':
        query.andWhere(`((${isFee}) OR (${noPrefix} AND log.targetType IN (:...moduleTargets)))`, {
          moduleTargets: AUDIT_MODULE_TARGET_TYPES.FEE,
        });
        return;
      case 'SYSTEM':
        query.andWhere(`(NOT (${isFee}) AND ((${isAuth}) OR log.targetType IN (:...moduleTargets)))`, {
          moduleTargets: AUDIT_MODULE_TARGET_TYPES.SYSTEM,
        });
        return;
      case 'OTHER':
        query.andWhere(`(${noPrefix} AND log.targetType NOT IN (:...moduleTargets))`, {
          moduleTargets: AUDIT_KNOWN_TARGET_TYPES,
        });
        return;
      default:
        // DOSSIER / CATALOG / REPORT — chỉ theo targetType, sau khi loại tiền tố ưu tiên.
        query.andWhere(`(${noPrefix} AND log.targetType IN (:...moduleTargets))`, {
          moduleTargets: AUDIT_MODULE_TARGET_TYPES[module],
        });
        return;
    }
  }
}
