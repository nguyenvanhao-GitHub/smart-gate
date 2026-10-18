import { BadRequestException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { PaginatedResult } from '../../../../common/http/pagination';
import { CatalogItem, CatalogType } from '../../domain/catalog.entities';
import { CatalogItemSearchCriteria, CatalogRepository } from '../ports/catalog.repository';
import { CreateCatalogItemUseCase } from './create-catalog-item.use-case';
import { UpdateCatalogItemUseCase } from './update-catalog-item.use-case';

class FakeCatalogRepository implements CatalogRepository {
  readonly types: CatalogType[];
  readonly items: CatalogItem[];

  constructor(types: CatalogType[], items: CatalogItem[] = []) {
    this.types = [...types];
    this.items = [...items];
  }

  async listTypes(): Promise<CatalogType[]> {
    return [...this.types];
  }
  async findTypeByCode(code: string): Promise<CatalogType | null> {
    return this.types.find((type) => type.code === code) ?? null;
  }
  async findTypeByName(name: string): Promise<CatalogType | null> {
    const normalized = normalizeName(name);
    return this.types.find((type) => normalizeName(type.name) === normalized) ?? null;
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
    return { items, total: items.length, page: 1, pageSize: 20 };
  }
  async findItemById(id: string): Promise<CatalogItem | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }
  async findItemByCode(typeCode: string, code: string): Promise<CatalogItem | null> {
    return this.items.find((item) => item.typeCode === typeCode && item.code === code) ?? null;
  }
  async findItemByName(typeCode: string, name: string): Promise<CatalogItem | null> {
    const normalized = normalizeName(name);
    return this.items.find((item) => item.typeCode === typeCode && normalizeName(item.name) === normalized) ?? null;
  }
  async findItemBySortOrder(typeCode: string, sortOrder: number): Promise<CatalogItem | null> {
    return this.items.find((item) => item.typeCode === typeCode && item.sortOrder === sortOrder) ?? null;
  }
  async saveItem(item: CatalogItem): Promise<CatalogItem> {
    const index = this.items.findIndex((current) => current.id === item.id);
    if (index >= 0) this.items[index] = item;
    else this.items.push(item);
    return item;
  }
  async ensure(): Promise<void> {}
}

class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];
  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function type(code: string): CatalogType {
  return CatalogType.create({ code, name: code, isSystem: false });
}

function item(typeCode: string, code: string, name: string): CatalogItem {
  return CatalogItem.create({ typeCode, code, name });
}

describe('Catalog item name uniqueness', () => {
  function build(types: CatalogType[], items: CatalogItem[] = []) {
    const catalogs = new FakeCatalogRepository(types, items);
    const audit = new RecordingAudit();
    return {
      catalogs,
      create: new CreateCatalogItemUseCase(catalogs, audit),
      update: new UpdateCatalogItemUseCase(catalogs, audit),
    };
  }

  it('không cho tạo item trùng tên trong cùng nhóm, không phân biệt hoa/thường và khoảng trắng', async () => {
    const catalogType = type('vehicle_type');
    const { catalogs, create } = build([catalogType], [item(catalogType.code, 'CAR', 'Ô tô')]);

    let key: string | undefined;
    await create.execute({ typeCode: catalogType.code, code: 'TRUCK', name: '  Ô TÔ  ' }).catch((error: BadRequestException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('catalog.itemNameDuplicated');
    expect(catalogs.items).toHaveLength(1);
  });

  it('cho phép hai item ở hai nhóm khác nhau có cùng tên', async () => {
    const vehicles = type('vehicle_type');
    const documents = type('document_type');
    const { catalogs, create } = build([vehicles, documents], [item(vehicles.code, 'OTHER', 'Khác')]);

    await expect(create.execute({ typeCode: documents.code, code: 'OTHER', name: 'Khác', sortOrder: 1 })).resolves.toBeDefined();
    expect(catalogs.items).toHaveLength(2);
  });

  it('không cho update item sang tên của item khác trong cùng nhóm', async () => {
    const catalogType = type('vehicle_type');
    const car = item(catalogType.code, 'CAR', 'Ô tô');
    const truck = item(catalogType.code, 'TRUCK', 'Xe tải');
    const { update } = build([catalogType], [car, truck]);

    let key: string | undefined;
    await update.execute({ typeCode: catalogType.code, itemId: truck.id, name: ' ô TÔ ' }).catch((error: BadRequestException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('catalog.itemNameDuplicated');
    expect(truck.name).toBe('Xe tải');
  });

  it('cho phép giữ nguyên tên của chính item đang update', async () => {
    const catalogType = type('vehicle_type');
    const car = item(catalogType.code, 'CAR', 'Ô tô');
    const { update } = build([catalogType], [car]);

    const saved = await update.execute({ typeCode: catalogType.code, itemId: car.id, name: '  Ô TÔ  ', sortOrder: 3 });

    expect(saved.name).toBe('Ô TÔ');
    expect(saved.sortOrder).toBe(3);
  });

  it('không cho tạo item trùng thứ tự sắp xếp trong cùng nhóm', async () => {
    const catalogType = type('vehicle_type');
    const existing = CatalogItem.create({ typeCode: catalogType.code, code: 'CAR', name: 'Ô tô', sortOrder: 1 });
    const { catalogs, create } = build([catalogType], [existing]);

    let key: string | undefined;
    let errors: unknown;
    await create.execute({ typeCode: catalogType.code, code: 'TRUCK', name: 'Xe tải', sortOrder: 1 }).catch((error: BadRequestException) => {
      const resp = error.getResponse() as { messageKey: string; errors?: unknown };
      key = resp.messageKey;
      errors = resp.errors;
    });

    expect(key).toBe('catalog.itemSortOrderDuplicated');
    expect(errors).toEqual([
      { field: 'sortOrder', message: 'Thứ tự sắp xếp đã tồn tại.', messageKey: 'catalog.itemSortOrderDuplicated' },
    ]);
    expect(catalogs.items).toHaveLength(1);
  });

  it('không cho update item sang thứ tự sắp xếp của item khác trong cùng nhóm', async () => {
    const catalogType = type('vehicle_type');
    const car = CatalogItem.create({ typeCode: catalogType.code, code: 'CAR', name: 'Ô tô', sortOrder: 1 });
    const truck = CatalogItem.create({ typeCode: catalogType.code, code: 'TRUCK', name: 'Xe tải', sortOrder: 2 });
    const { update } = build([catalogType], [car, truck]);

    let key: string | undefined;
    await update.execute({ typeCode: catalogType.code, itemId: truck.id, sortOrder: 1 }).catch((error: BadRequestException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('catalog.itemSortOrderDuplicated');
    expect(truck.sortOrder).toBe(2);
  });

  it('cho phép giữ nguyên thứ tự sắp xếp của chính item đang update', async () => {
    const catalogType = type('vehicle_type');
    const car = CatalogItem.create({ typeCode: catalogType.code, code: 'CAR', name: 'Ô tô', sortOrder: 1 });
    const { update } = build([catalogType], [car]);

    const saved = await update.execute({ typeCode: catalogType.code, itemId: car.id, sortOrder: 1 });

    expect(saved.sortOrder).toBe(1);
  });
});
