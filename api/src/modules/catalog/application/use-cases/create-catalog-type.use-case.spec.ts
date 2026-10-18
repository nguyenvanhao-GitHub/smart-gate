import { BadRequestException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { PaginatedResult } from '../../../../common/http/pagination';
import { CatalogItem, CatalogType } from '../../domain/catalog.entities';
import { CatalogItemSearchCriteria, CatalogRepository } from '../ports/catalog.repository';
import { CreateCatalogTypeUseCase } from './create-catalog-type.use-case';

/** Kho danh mục giả trong bộ nhớ — chỉ dùng cho kiểm thử use-case nhóm danh mục (F04). */
class FakeCatalogRepository implements CatalogRepository {
  readonly types: CatalogType[] = [];

  constructor(seed: CatalogType[] = []) {
    this.types.push(...seed);
  }

  async listTypes(): Promise<CatalogType[]> {
    return [...this.types];
  }

  async findTypeByCode(code: string): Promise<CatalogType | null> {
    return this.types.find((type) => type.code === code) ?? null;
  }

  async findTypeByName(name: string): Promise<CatalogType | null> {
    const normalized = name.trim().toLocaleLowerCase();
    return this.types.find((type) => type.name.trim().toLocaleLowerCase() === normalized) ?? null;
  }

  async saveType(type: CatalogType): Promise<CatalogType> {
    const index = this.types.findIndex((item) => item.id === type.id);
    if (index >= 0) this.types[index] = type;
    else this.types.push(type);
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

  async findItems(_criteria: CatalogItemSearchCriteria): Promise<PaginatedResult<CatalogItem>> {
    return { items: [], total: 0, page: 1, pageSize: 20 };
  }

  async findItemById(_id: string): Promise<CatalogItem | null> {
    return null;
  }

  async findItemByCode(_typeCode: string, _code: string): Promise<CatalogItem | null> {
    return null;
  }

  async findItemByName(_typeCode: string, _name: string): Promise<CatalogItem | null> {
    return null;
  }

  async findItemBySortOrder(_typeCode: string, _sortOrder: number): Promise<CatalogItem | null> {
    return null;
  }

  async saveItem(item: CatalogItem): Promise<CatalogItem> {
    return item;
  }

  async ensure(): Promise<void> {
    return;
  }
}

class RecordingAudit implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];
  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

function systemType(code: string, name: string): CatalogType {
  return CatalogType.create({ code, name, isSystem: true, sortOrder: 1 });
}

describe('CreateCatalogTypeUseCase — thêm nhóm danh mục (F04)', () => {
  function build(seed: CatalogType[] = []) {
    const catalogs = new FakeCatalogRepository(seed);
    const audit = new RecordingAudit();
    return { catalogs, audit, useCase: new CreateCatalogTypeUseCase(catalogs, audit) };
  }

  it('tạo nhóm mới là nhóm THƯỜNG (isSystem=false), tách với nhóm nền do seed sinh', async () => {
    const { catalogs, useCase } = build();

    const type = await useCase.execute({ code: 'VEHICLE_TYPE', name: 'Loại phương tiện' });

    expect(type.isSystem).toBe(false);
    expect(catalogs.types).toHaveLength(1);
  });

  it('chuẩn hóa mã về chữ thường và cắt khoảng trắng của tên/mô tả', async () => {
    const { useCase } = build();

    const type = await useCase.execute({
      code: '  Vehicle_Type  ',
      name: '  Loại phương tiện  ',
      description: '  mô tả  ',
    });

    expect(type.code).toBe('vehicle_type');
    expect(type.name).toBe('Loại phương tiện');
    expect(type.description).toBe('mô tả');
  });

  it('mô tả rỗng / chỉ khoảng trắng được lưu thành null', async () => {
    const { useCase } = build();

    const type = await useCase.execute({ code: 'unit', name: 'Đơn vị', description: '   ' });

    expect(type.description).toBeNull();
  });

  it('mã trùng (kể cả khác hoa/thường) → 400 catalog.typeCodeDuplicated, không thêm nhóm', async () => {
    const { catalogs, useCase } = build([systemType('vehicle_type', 'Loại phương tiện')]);

    await expect(useCase.execute({ code: 'VEHICLE_TYPE', name: 'Trùng' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    let key: string | undefined;
    await useCase.execute({ code: 'vehicle_type', name: 'Trùng' }).catch((error: BadRequestException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });
    expect(key).toBe('catalog.typeCodeDuplicated');
    expect(catalogs.types).toHaveLength(1);
  });

  it('tên nhóm trùng không phân biệt hoa/thường và khoảng trắng → 400 catalog.typeNameDuplicated', async () => {
    const { catalogs, useCase } = build([systemType('vehicle_type', 'Loại phương tiện')]);

    let key: string | undefined;
    await useCase.execute({ code: 'vehicle_kind', name: '  LOẠI PHƯƠNG TIỆN  ' }).catch((error: BadRequestException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('catalog.typeNameDuplicated');
    expect(catalogs.types).toHaveLength(1);
  });

  it('không truyền sortOrder thì mặc định sortOrder = 0', async () => {
    const { useCase } = build([systemType('a', 'A'), systemType('b', 'B')]);

    const type = await useCase.execute({ code: 'c', name: 'C' });

    expect(type.sortOrder).toBe(0);
  });

  it('có truyền sortOrder thì lưu đúng giá trị truyền vào', async () => {
    const { useCase } = build();

    const type = await useCase.execute({ code: 'custom', name: 'Nhóm tùy chỉnh', sortOrder: 5 });

    expect(type.sortOrder).toBe(5);
  });

  it('ghi nhật ký kiểm toán CATALOG_TYPE_CREATE trỏ đúng nhóm vừa tạo', async () => {
    const { audit, useCase } = build();

    const type = await useCase.execute({ code: 'unit', name: 'Đơn vị' });

    const entry = audit.entries.find((item) => item.action === 'CATALOG_TYPE_CREATE');
    expect(entry).toBeDefined();
    expect(entry?.targetType).toBe('CATALOG_TYPE');
    expect(entry?.targetId).toBe(type.id);
  });
});
