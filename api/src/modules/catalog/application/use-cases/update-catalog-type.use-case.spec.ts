import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { PaginatedResult } from '../../../../common/http/pagination';
import { CatalogItem, CatalogType } from '../../domain/catalog.entities';
import { CatalogItemSearchCriteria, CatalogRepository } from '../ports/catalog.repository';
import { UpdateCatalogTypeUseCase } from './update-catalog-type.use-case';

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

/** F04 — sửa nội dung nhóm danh mục. Khóa: mã nhóm bất biến, sửa được tên/mô tả/thứ tự, không thấy → 404. */
describe('UpdateCatalogTypeUseCase — sửa nhóm danh mục (F04)', () => {
  function build(seed: CatalogType[] = []) {
    const catalogs = new FakeCatalogRepository(seed);
    const audit = new RecordingAudit();
    return { catalogs, audit, useCase: new UpdateCatalogTypeUseCase(catalogs, audit) };
  }

  function seedType(overrides: Partial<{ code: string; name: string; isSystem: boolean; sortOrder: number }> = {}): CatalogType {
    return CatalogType.create({
      code: overrides.code ?? 'vehicle_type',
      name: overrides.name ?? 'Loại phương tiện',
      description: 'mô tả cũ',
      isSystem: overrides.isSystem ?? false,
      sortOrder: overrides.sortOrder ?? 1,
    });
  }

  it('sửa tên/mô tả/thứ tự của nhóm', async () => {
    const type = seedType();
    const { useCase } = build([type]);

    const saved = await useCase.execute({
      typeCode: 'vehicle_type',
      name: 'Tên mới',
      description: 'mô tả mới',
      sortOrder: 5,
    });

    expect(saved.name).toBe('Tên mới');
    expect(saved.description).toBe('mô tả mới');
    expect(saved.sortOrder).toBe(5);
  });

  it('MÃ NHÓM bất biến — vẫn giữ mã cũ dù chỉ nhận typeCode để định vị', async () => {
    const type = seedType({ code: 'vehicle_type' });
    const { useCase } = build([type]);

    const saved = await useCase.execute({ typeCode: 'vehicle_type', name: 'Tên mới' });

    expect(saved.code).toBe('vehicle_type');
  });

  it('mô tả gửi rỗng / khoảng trắng được ghi thành null; không gửi thì giữ nguyên', async () => {
    const { catalogs, useCase } = build([seedType()]);

    await useCase.execute({ typeCode: 'vehicle_type', description: '  ' });
    expect(catalogs.types[0].description).toBeNull();

    await useCase.execute({ typeCode: 'vehicle_type', name: 'Chỉ đổi tên' });
    // description không nằm trong lệnh → giữ null như lần trước, không bị đổi ngoài ý muốn.
    expect(catalogs.types[0].description).toBeNull();
  });

  it('nhóm hệ thống vẫn sửa được tên/mô tả (chỉnh nhãn hiển thị)', async () => {
    const type = seedType({ isSystem: true });
    const { useCase } = build([type]);

    const saved = await useCase.execute({ typeCode: 'vehicle_type', name: 'Nhãn mới' });

    expect(saved.isSystem).toBe(true);
    expect(saved.name).toBe('Nhãn mới');
  });

  it('không cho đổi sang tên của nhóm khác, không phân biệt hoa/thường và khoảng trắng', async () => {
    const first = seedType({ code: 'vehicle_type', name: 'Loại phương tiện' });
    const second = seedType({ code: 'document_type', name: 'Loại giấy tờ' });
    const { useCase } = build([first, second]);

    let key: string | undefined;
    await useCase.execute({ typeCode: 'document_type', name: '  LOẠI PHƯƠNG TIỆN ' }).catch((error: BadRequestException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('catalog.typeNameDuplicated');
    expect(second.name).toBe('Loại giấy tờ');
  });

  it('cho phép giữ nguyên tên của chính nhóm đang sửa', async () => {
    const type = seedType({ name: 'Loại phương tiện' });
    const { useCase } = build([type]);

    const saved = await useCase.execute({ typeCode: type.code, name: '  LOẠI PHƯƠNG TIỆN  ', sortOrder: 9 });

    expect(saved.name).toBe('LOẠI PHƯƠNG TIỆN');
    expect(saved.sortOrder).toBe(9);
  });

  it('không tìm thấy nhóm → 404 catalog.typeNotFound', async () => {
    const { useCase } = build([]);

    await expect(useCase.execute({ typeCode: 'khong-co', name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    let key: string | undefined;
    await useCase.execute({ typeCode: 'khong-co', name: 'X' }).catch((error: NotFoundException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });
    expect(key).toBe('catalog.typeNotFound');
  });

  it('ghi nhật ký CATALOG_TYPE_UPDATE có ảnh chụp trước/sau', async () => {
    const { audit, useCase } = build([seedType({ name: 'Tên cũ' })]);

    await useCase.execute({ typeCode: 'vehicle_type', name: 'Tên mới' });

    const entry = audit.entries.find((item) => item.action === 'CATALOG_TYPE_UPDATE');
    expect(entry).toBeDefined();
    expect((entry?.before as { name?: string })?.name).toBe('Tên cũ');
    expect((entry?.after as { name?: string })?.name).toBe('Tên mới');
  });
});
