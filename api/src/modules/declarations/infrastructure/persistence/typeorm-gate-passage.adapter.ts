import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GatePassageTimes, GatePassageTimesQuery } from '../../../../common/gate/gate-passage.port';
import { GateDirection } from '../../../catalog/domain/border-facility.catalog';
import { GateDecision } from '../../../gate/domain/gate-event.entity';
import { GateEventOrmEntity } from '../../../gate/infrastructure/persistence/gate-event.orm-entity';

/**
 * Hiện thực `GATE_PASSAGE_TIMES` (CR12): đọc mốc nhập/xuất cảnh từ bảng `gate_events`. Adapter đặt ở
 * phân hệ `declarations` (không phải `gate`) để tránh vòng module — chiều phụ thuộc là `gate` →
 * `declarations`. Chỉ tính các sự kiện **CHO QUA** (`ALLOW`); lấy mốc **sớm nhất** của mỗi chiều.
 */
@Injectable()
export class TypeOrmGatePassageAdapter implements GatePassageTimesQuery {
  constructor(
    @InjectRepository(GateEventOrmEntity)
    private readonly events: Repository<GateEventOrmEntity>,
  ) {}

  async timesOf(dossierId: string): Promise<GatePassageTimes> {
    const rows = await this.events
      .createQueryBuilder('event')
      .select('event.direction', 'direction')
      .addSelect('MIN(event.occurredAt)', 'firstAt')
      .where('event.dossierId = :dossierId', { dossierId })
      .andWhere('event.decision = :decision', { decision: GateDecision.ALLOW })
      .groupBy('event.direction')
      .getRawMany<{ direction: string; firstAt: Date | string | null }>();

    const at = (direction: GateDirection): Date | null => {
      const value = rows.find((row) => row.direction === direction)?.firstAt ?? null;
      return value ? new Date(value) : null;
    };

    return { entryAt: at(GateDirection.ENTRY), exitAt: at(GateDirection.EXIT) };
  }
}
