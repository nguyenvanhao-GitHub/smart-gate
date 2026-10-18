import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { YardZoneConfig, buildSlotCodes } from '../../../catalog/domain/border-facility.catalog';
import { ParkingSlot, Yard } from '../../domain/yard.entity';
import { YardRepository } from '../../application/ports/yard.repository';
import { ParkingSlotOrmEntity } from './parking-slot.orm-entity';
import { YardMapper } from './dispatch.mapper';
import { YardOrmEntity } from './yard.orm-entity';

@Injectable()
export class TypeOrmYardRepository implements YardRepository {
  constructor(
    @InjectRepository(YardOrmEntity)
    private readonly yards: Repository<YardOrmEntity>,
    @InjectRepository(ParkingSlotOrmEntity)
    private readonly slots: Repository<ParkingSlotOrmEntity>,
  ) {}

  async listYards(): Promise<Yard[]> {
    const rows = await this.yards.find({ order: { code: 'ASC' } });
    if (rows.length === 0) return [];
    const slotRows = await this.slots.find({ where: { yardId: In(rows.map((row) => row.id)) } });
    return rows.map((row) =>
      YardMapper.toDomain(
        row,
        slotRows.filter((slot) => slot.yardId === row.id),
      ),
    );
  }

  async findYardById(id: string): Promise<Yard | null> {
    if (!id || typeof id !== 'string') return null;
    const cleanId = id.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId)) {
      return this.findYardByCode(cleanId);
    }
    const row = await this.yards.findOne({ where: { id: cleanId } });
    if (!row) return this.findYardByCode(cleanId);
    return YardMapper.toDomain(row, await this.slots.find({ where: { yardId: row.id } }));
  }

  async findYardByCode(code: string): Promise<Yard | null> {
    const row = await this.yards.findOne({ where: { code } });
    if (!row) return null;
    return YardMapper.toDomain(row, await this.slots.find({ where: { yardId: row.id } }));
  }

  /** Đồng bộ theo danh mục: cập nhật khu đã có, thêm ô mới, bật/tắt active tương ứng với sức chứa. */
  async ensureLayout(zones: YardZoneConfig[]): Promise<void> {
    for (const zone of zones) {
      const existing = await this.yards.findOne({ where: { code: zone.code } });
      const yard = existing ? YardMapper.toDomain(existing, []) : Yard.create(zone.code, zone.name, zone.capacity);

      yard.name = zone.name;
      yard.capacity = zone.capacity;
      yard.isActive = zone.active;
      await this.yards.save(YardMapper.toPersistence(yard));

      const current = await this.slots.find({ where: { yardId: yard.id } });
      const currentMap = new Map(current.map((slot) => [slot.code, slot]));
      const targetCodes = new Set(buildSlotCodes(zone));

      // 1. Thêm ô đỗ mới chưa có trong cơ sở dữ liệu
      const missing = buildSlotCodes(zone)
        .map((code, index) => ({ code, sortOrder: index + 1 }))
        .filter((slot) => !currentMap.has(slot.code))
        .map((slot) => YardMapper.toSlotPersistence(ParkingSlot.create(yard.id, slot.code, slot.sortOrder)));

      if (missing.length > 0) {
        await this.slots.save(missing);
      }

      // 2. Kích hoạt lại các ô nằm trong sức chứa mới nếu trước đó đang ngưng
      const toReactivate = current.filter((slot) => targetCodes.has(slot.code) && !slot.isActive);
      if (toReactivate.length > 0) {
        for (const slot of toReactivate) slot.isActive = true;
        await this.slots.save(toReactivate);
      }

      // 3. Xóa cứng (remove) các ô vượt quá sức chứa mới khỏi bảng parking_slots
      const excess = current.filter((slot) => !targetCodes.has(slot.code));
      if (excess.length > 0) {
        await this.slots.remove(excess);
      }
    }
  }

  async setSlotActive(yardId: string, slotCode: string, isActive: boolean): Promise<number> {
    const result = await this.slots.update({ yardId, code: slotCode }, { isActive });
    return result.affected ?? 0;
  }
}
