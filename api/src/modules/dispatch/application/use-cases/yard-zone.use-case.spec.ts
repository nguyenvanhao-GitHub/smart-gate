import { NotFoundException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { PaginatedResult } from '../../../../common/http/pagination';
import {
  CatalogItemSearchCriteria,
  CatalogRepository,
} from '../../../catalog/application/ports/catalog.repository';
import { BorderFacilityService } from '../../../catalog/application/services/border-facility.service';
import { YARD_ZONE_TYPE_CODE } from '../../../catalog/domain/border-facility.catalog';
import { CatalogItem, CatalogType } from '../../../catalog/domain/catalog.entities';
import { DispatchAssignment } from '../../domain/dispatch-assignment.entity';
import { InMemoryDispatchAssignmentRepository, InMemoryYardRepository, makeYardZone } from '../../testing/dispatch.fixture';
import { ListYardZonesUseCase } from './list-yard-zones.use-case';
import { UpdateYardZoneUseCase } from './update-yard-zone.use-case';

class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];
  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

/** Kho danh mục trong bộ nhớ — nguồn sự thật của cấu hình khu bãi (điểm D8). */
class FakeCatalogRepository implements CatalogRepository {
  constructor(readonly items: CatalogItem[] = []) {}
  async listTypes(): Promise<CatalogType[]> {
    return [];
  }
  async findTypeByCode(): Promise<CatalogType | null> {
    return null;
  }
  async findTypeByName(): Promise<CatalogType | null> {
    return null;
  }
  async saveType(type: CatalogType): Promise<CatalogType> {
    return type;
  }
  async countItemsByType(): Promise<Record<string, number>> {
    return {};
  }
  async countItemsOfType(): Promise<number> {
    return 0;
  }
  async deleteType(): Promise<void> {
    return;
  }
  async deleteItem(): Promise<void> {
    return;
  }
  async findItems(criteria: CatalogItemSearchCriteria): Promise<PaginatedResult<CatalogItem>> {
    const items = this.items.filter((item) => item.typeCode === criteria.typeCode);
    return { items, total: items.length, page: 1, pageSize: 100 };
  }
  async findItemById(id: string): Promise<CatalogItem | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }
  async findItemByCode(typeCode: string, code: string): Promise<CatalogItem | null> {
    return this.items.find((item) => item.typeCode === typeCode && item.code === code) ?? null;
  }
  async findItemByName(typeCode: string, name: string): Promise<CatalogItem | null> {
    const normalized = name.trim().toLocaleLowerCase();
    return this.items.find((item) => item.typeCode === typeCode && item.name.trim().toLocaleLowerCase() === normalized) ?? null;
  }
  async findItemBySortOrder(typeCode: string, sortOrder: number): Promise<CatalogItem | null> {
    return this.items.find((item) => item.typeCode === typeCode && item.sortOrder === sortOrder) ?? null;
  }
  async saveItem(item: CatalogItem): Promise<CatalogItem> {
    const index = this.items.findIndex((row) => row.id === item.id);
    if (index >= 0) this.items[index] = item;
    else this.items.push(item);
    return item;
  }
  async ensure(): Promise<void> {
    // Không cần cho test.
  }
}

/** Một mục danh mục YARD_ZONE với metadata sức chứa + cách sinh mã ô. */
function makeYardZoneItem(code: string, name: string, capacity: number, slotCount: number): CatalogItem {
  return CatalogItem.create({
    typeCode: YARD_ZONE_TYPE_CODE,
    code,
    name,
    metadata: { capacity, slotPrefix: code, slotCount },
  });
}

/** F42 — cấu hình bãi đỗ. */
describe('Cấu hình khu bãi (F42)', () => {
  describe('UpdateYardZoneUseCase', () => {
    function build(items: CatalogItem[]) {
      const catalogs = new FakeCatalogRepository(items);
      const facilities = new BorderFacilityService(catalogs);
      const yards = new InMemoryYardRepository([makeYardZone({ code: 'A', slotCount: 16 })]);
      const assignments = new InMemoryDispatchAssignmentRepository();
      const audit = new RecordingAudit();
      return {
        catalogs,
        audit,
        useCase: new UpdateYardZoneUseCase(catalogs, facilities, yards, assignments, audit),
      };
    }

    it('cập nhật tên + sức chứa và đồng bộ slotCount trong metadata cũng như xóa ô thừa', async () => {
      const item = makeYardZoneItem('A', 'Khu A', 16, 16);
      const catalogs = new FakeCatalogRepository([item]);
      const facilities = new BorderFacilityService(catalogs);
      const yards = new InMemoryYardRepository([makeYardZone({ code: 'A', capacity: 16, slotCount: 16 })]);
      const assignments = new InMemoryDispatchAssignmentRepository();
      const audit = new RecordingAudit();
      const useCase = new UpdateYardZoneUseCase(catalogs, facilities, yards, assignments, audit);

      // 1. Tăng sức chứa từ 16 lên 20 -> tạo thêm các ô mới A17..A20
      const view = await useCase.execute({ code: 'A', name: 'Khu A - sửa', capacity: 20 });

      expect(view.name).toBe('Khu A - sửa');
      expect(view.capacity).toBe(20);
      expect(view.slotCount).toBe(20);
      const yardA = await yards.findYardByCode('A');
      expect(yardA?.capacity).toBe(20);
      expect(yardA?.slots).toHaveLength(20);

      // 2. Giảm sức chứa từ 20 xuống 10 -> xóa luôn các ô A11..A20 khỏi danh sách slots
      const viewReduced = await useCase.execute({ code: 'A', capacity: 10 });
      expect(viewReduced.capacity).toBe(10);
      expect(viewReduced.slotCount).toBe(10);
      const yardAReduced = await yards.findYardByCode('A');
      expect(yardAReduced?.slots).toHaveLength(10);
      expect(yardAReduced?.slots.find((s) => s.code === 'A15')).toBeUndefined();
    });

    it('chặn giảm sức chứa khi ô bị giảm đang có xe đỗ kèm vị trí/biển số chi tiết → 409 yardZone.cannotReduceSlotOccupied', async () => {
      const item = makeYardZoneItem('A', 'Khu A', 16, 16);
      const catalogs = new FakeCatalogRepository([item]);
      const facilities = new BorderFacilityService(catalogs);
      const yards = new InMemoryYardRepository([makeYardZone({ code: 'A', capacity: 16, slotCount: 16 })]);
      const assignments = new InMemoryDispatchAssignmentRepository();
      const audit = new RecordingAudit();
      const useCase = new UpdateYardZoneUseCase(catalogs, facilities, yards, assignments, audit);

      const yardA = await yards.findYardByCode('A');
      // Đặt 1 xe đỗ ở ô A15
      await assignments.insert(
        DispatchAssignment.assign({
          dossierId: 'ho-so-1',
          gateCode: null,
          laneCode: null,
          yardId: yardA!.id,
          slotCode: 'A15',
          assignedById: null,
          note: null,
        }),
      );

      // Cố gắng giảm sức chứa xuống 10 (ô A15 sẽ bị xóa) -> báo lỗi 409 với chi tiết ô A15
      await expect(useCase.execute({ code: 'A', capacity: 10 })).rejects.toThrow();
      try {
        await useCase.execute({ code: 'A', capacity: 10 });
      } catch (thrown: any) {
        const response = thrown.getResponse();
        expect(response).toMatchObject({ messageKey: 'yardZone.cannotReduceSlotOccupied' });
        expect(response.message).toContain('A15');
      }
    });

    it('chặn giảm sức chứa khi tổng số xe đỗ lớn hơn sức chứa mới → 409 yardZone.cannotReduceCapacityBelowOccupied', async () => {
      const item = makeYardZoneItem('A', 'Khu A', 16, 16);
      const catalogs = new FakeCatalogRepository([item]);
      const facilities = new BorderFacilityService(catalogs);
      const yards = new InMemoryYardRepository([makeYardZone({ code: 'A', capacity: 16, slotCount: 16 })]);
      const assignments = new InMemoryDispatchAssignmentRepository();
      const audit = new RecordingAudit();
      const useCase = new UpdateYardZoneUseCase(catalogs, facilities, yards, assignments, audit);

      const yardA = await yards.findYardByCode('A');
      // Đặt 3 xe đỗ trong bãi (A01, A02 và 1 xe chưa phân ô cụ thể)
      for (let i = 1; i <= 3; i++) {
        await assignments.insert(
          DispatchAssignment.assign({
            dossierId: `ho-so-${i}`,
            gateCode: null,
            laneCode: null,
            yardId: yardA!.id,
            slotCode: i <= 2 ? `A0${i}` : null,
            assignedById: null,
            note: null,
          }),
        );
      }

      // Cố gắng giảm sức chứa xuống 2 (nhỏ hơn 3 xe đang đỗ) -> báo lỗi 409
      try {
        await useCase.execute({ code: 'A', capacity: 2 });
      } catch (thrown: any) {
        const response = thrown.getResponse();
        expect(response).toMatchObject({ messageKey: 'yardZone.cannotReduceCapacityBelowOccupied' });
        expect(response.message).toContain('3 xe đỗ');
      }
    });

    it('sức chứa 0 là hợp lệ (tạm ngừng nhận xe)', async () => {
      const { useCase, catalogs } = build([makeYardZoneItem('A', 'Khu A', 16, 16)]);

      const view = await useCase.execute({ code: 'A', capacity: 0 });

      expect(view.capacity).toBe(0);
      expect(catalogs.items.find((row) => row.code === 'A')?.metadata).toMatchObject({ capacity: 0 });
    });

    it('chặn sức chứa âm → 400 yardZone.invalidCapacity', async () => {
      const { useCase } = build([makeYardZoneItem('A', 'Khu A', 16, 16)]);

      await expect(useCase.execute({ code: 'A', capacity: -5 })).rejects.toThrow();
      try {
        await useCase.execute({ code: 'A', capacity: -5 });
      } catch (thrown: any) {
        expect(thrown.getResponse()).toMatchObject({ messageKey: 'yardZone.invalidCapacity' });
      }
    });

    it('không gửi capacity thì giữ nguyên sức chứa cũ', async () => {
      const { useCase } = build([makeYardZoneItem('A', 'Khu A', 16, 16)]);

      const view = await useCase.execute({ code: 'A', name: 'Chỉ đổi tên' });

      expect(view.capacity).toBe(16);
      expect(view.name).toBe('Chỉ đổi tên');
    });

    it('mã khu không có trong danh mục → 404 yardZone.notFound', async () => {
      const { useCase } = build([makeYardZoneItem('A', 'Khu A', 16, 16)]);

      await expect(useCase.execute({ code: 'Z', capacity: 5 })).rejects.toBeInstanceOf(NotFoundException);
      try {
        await useCase.execute({ code: 'Z', capacity: 5 });
      } catch (thrown) {
        expect((thrown as NotFoundException).getResponse()).toMatchObject({ messageKey: 'yardZone.notFound' });
      }
    });
  });

  describe('ListYardZonesUseCase', () => {
    it('tính "used" ĐÚNG theo mã khu từ số ô đang có xe', async () => {
      const catalogs = new FakeCatalogRepository([
        makeYardZoneItem('A', 'Khu A', 16, 16),
        makeYardZoneItem('B', 'Khu B', 16, 16),
      ]);
      const facilities = new BorderFacilityService(catalogs);
      const yards = new InMemoryYardRepository([
        makeYardZone({ code: 'A', slotCount: 16 }),
        makeYardZone({ code: 'B', slotCount: 16 }),
      ]);
      const assignments = new InMemoryDispatchAssignmentRepository();
      const yardA = await yards.findYardByCode('A');
      await assignments.insert(
        DispatchAssignment.assign({
          dossierId: 'ho-so-1',
          gateCode: null,
          laneCode: null,
          yardId: yardA!.id,
          slotCode: 'A01',
          assignedById: null,
          note: null,
        }),
      );

      const zones = await new ListYardZonesUseCase(facilities, yards, assignments).execute();

      const zoneA = zones.find((zone) => zone.code === 'A');
      const zoneB = zones.find((zone) => zone.code === 'B');
      expect(zoneA?.used).toBe(1);
      expect(zoneB?.used).toBe(0);
      // Cấu hình sức chứa/số ô vẫn lấy từ danh mục.
      expect(zoneA).toMatchObject({ capacity: 16, slotCount: 16 });
    });

    it('khu chưa có xe nào thì used = 0', async () => {
      const catalogs = new FakeCatalogRepository([makeYardZoneItem('A', 'Khu A', 16, 16)]);
      const facilities = new BorderFacilityService(catalogs);
      const yards = new InMemoryYardRepository([makeYardZone({ code: 'A', slotCount: 16 })]);
      const assignments = new InMemoryDispatchAssignmentRepository();

      const zones = await new ListYardZonesUseCase(facilities, yards, assignments).execute();

      expect(zones).toHaveLength(1);
      expect(zones[0].used).toBe(0);
    });
  });
});
