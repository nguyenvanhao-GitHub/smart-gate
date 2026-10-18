import { Inject, Injectable } from '@nestjs/common';
import { MAX_PAGE_SIZE } from '../../../../common/http/pagination';
import { toText } from '../../../../common/text/to-text';
import {
  BORDER_GATE_TYPE_CODE,
  BorderGateConfig,
  GATE_LANE_TYPE_CODE,
  GateLaneConfig,
  YARD_ZONE_TYPE_CODE,
  YardZoneConfig,
  toGateDirection,
} from '../../domain/border-facility.catalog';
import { CatalogItemStatus } from '../../domain/catalog-status.enum';
import { CatalogItem } from '../../domain/catalog.entities';
import { CATALOG_REPOSITORY, CatalogRepository } from '../ports/catalog.repository';

/**
 * Đọc cấu hình vật lý cửa khẩu (điểm **D8**) từ danh mục dùng chung.
 *
 * Trả về **cả mục đã khoá** kèm cờ `active` để màn hình quản trị vẫn nhìn thấy cổng/làn tạm ngừng;
 * phía sử dụng (điều phối, cổng) tự lọc theo `active`.
 */
@Injectable()
export class BorderFacilityService {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
  ) {}

  async listGates(): Promise<BorderGateConfig[]> {
    const items = await this.itemsOf(BORDER_GATE_TYPE_CODE);
    return items.map((item) => ({
      code: item.code,
      name: item.name,
      direction: toGateDirection(item.metadata?.direction),
      checkpoint: toText(item.metadata?.checkpoint),
      active: item.status === CatalogItemStatus.ACTIVE,
    }));
  }

  async findGate(code: string): Promise<BorderGateConfig | null> {
    const gates = await this.listGates();
    return gates.find((gate) => gate.code === code) ?? null;
  }

  async listLanes(): Promise<GateLaneConfig[]> {
    const items = await this.itemsOf(GATE_LANE_TYPE_CODE);
    return items.map((item) => ({
      code: item.code,
      name: item.name,
      gateCode: toText(item.metadata?.gateCode),
      active: item.status === CatalogItemStatus.ACTIVE,
    }));
  }

  async findLane(code: string): Promise<GateLaneConfig | null> {
    const lanes = await this.listLanes();
    return lanes.find((lane) => lane.code === code) ?? null;
  }

  async listYardZones(): Promise<YardZoneConfig[]> {
    const items = await this.itemsOf(YARD_ZONE_TYPE_CODE);
    return items.map((item) => ({
      code: item.code,
      name: item.name,
      capacity: this.toPositiveInt(item.metadata?.capacity, 0),
      slotPrefix: toText(item.metadata?.slotPrefix, item.code),
      slotCount: this.toPositiveInt(item.metadata?.slotCount, 0),
      active: item.status === CatalogItemStatus.ACTIVE,
    }));
  }

  private async itemsOf(typeCode: string): Promise<CatalogItem[]> {
    const page = await this.catalogs.findItems({ typeCode, page: 1, pageSize: MAX_PAGE_SIZE });
    return page.items;
  }

  private toPositiveInt(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }
}
