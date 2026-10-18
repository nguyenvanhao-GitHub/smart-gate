import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { PaginatedResult } from '../../../../common/http/pagination';
import { CatalogItemStatus } from '../../domain/catalog-status.enum';
import { CatalogItem, CatalogType } from '../../domain/catalog.entities';
import { CatalogItemSearchCriteria, CatalogRepository } from '../ports/catalog.repository';
import { DeleteCatalogItemUseCase } from './delete-catalog-item.use-case';

class FakeCatalogRepository implements CatalogRepository {
  readonly types: CatalogType[] = [];
  readonly items: CatalogItem[] = [];

  constructor(types: CatalogType[] = [], items: CatalogItem[] = []) {
    this.types.push(...types);
    this.items.push(...items);
  }

  async listTypes(): Promise<CatalogType[]> {
    return [...this.types];
  }
  async findTypeByCode(code: string): Promise<CatalogType | null> {
    return this.types.find((type) => type.code === code) ?? null;
  }
  async findTypeByName(): Promise<CatalogType | null> {
    return null;
  }
  async saveType(type: CatalogType): Promise<CatalogType> {
    return type;
  }
  async deleteType(id: string): Promise<void> {
    const index = this.types.findIndex((type) => type.id === id);
    if (index >= 0) this.types.splice(index, 1);
  }
  async countItemsByType(): Promise<Record<string, number>> {
    return {};
  }
  async countItemsOfType(typeCode: string): Promise<number> {
    return this.items.filter((item) => item.typeCode === typeCode).length;
  }
  async findItems(_criteria: CatalogItemSearchCriteria): Promise<PaginatedResult<CatalogItem>> {
    return { items: [], total: 0, page: 1, pageSize: 20 };
  }
  async findItemById(id: string): Promise<CatalogItem | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }
  async findItemByCode(): Promise<CatalogItem | null> {
    return null;
  }
  async findItemByName(): Promise<CatalogItem | null> {
    return null;
  }
  async findItemBySortOrder(): Promise<CatalogItem | null> {
    return null;
  }
  async saveItem(item: CatalogItem): Promise<CatalogItem> {
    return item;
  }
  async deleteItem(id: string): Promise<void> {
    const index = this.items.findIndex((item) => item.id === id);
    if (index >= 0) this.items.splice(index, 1);
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

/**
 * BUG-058 — xóa mục danh mục có rào an toàn: chỉ mục do admin tự thêm (nhóm không mặc định) và chưa
 * khóa/chưa dùng mới xóa cứng được; còn lại chỉ được khóa (F04).
 */
describe('DeleteCatalogItemUseCase — xóa mục danh mục có rào (BUG-058)', () => {
  function build(types: CatalogType[], items: CatalogItem[]) {
    const catalogs = new FakeCatalogRepository(types, items);
    const audit = new RecordingAudit();
    return { catalogs, audit, useCase: new DeleteCatalogItemUseCase(catalogs, audit) };
  }

  function type(overrides: Partial<{ code: string; isSystem: boolean }> = {}): CatalogType {
    return CatalogType.create({
      code: overrides.code ?? 'cargo_type',
      name: 'Loại hàng',
      isSystem: overrides.isSystem ?? false,
    });
  }

  function item(typeCode: string): CatalogItem {
    return CatalogItem.create({ typeCode, code: 'AGRICULTURAL', name: 'Nông sản' });
  }

  it('xóa mục ACTIVE của nhóm admin tự thêm → xóa khỏi kho và ghi nhật ký', async () => {
    const it0 = item('cargo_type');
    const { catalogs, audit, useCase } = build([type({ code: 'cargo_type', isSystem: false })], [it0]);

    const result = await useCase.execute('cargo_type', it0.id);

    expect(result).toEqual({ deleted: true });
    expect(catalogs.items).toHaveLength(0);
    expect(audit.entries.some((entry) => entry.action === 'CATALOG_ITEM_DELETE')).toBe(true);
  });

  it('KHÔNG cho xóa mục thuộc nhóm MẶC ĐỊNH (isSystem) → 400, không xóa, không ghi nhật ký', async () => {
    const it0 = item('document_type');
    const { catalogs, audit, useCase } = build([type({ code: 'document_type', isSystem: true })], [it0]);

    let key: string | undefined;
    await useCase.execute('document_type', it0.id).catch((error: BadRequestException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('catalog.itemDeleteSystemForbidden');
    expect(catalogs.items).toHaveLength(1);
    expect(audit.entries).toEqual([]);
  });

  it('KHÔNG cho xóa mục đã KHÓA (coi như đã dùng) → 400, không xóa', async () => {
    const it0 = item('cargo_type');
    it0.status = CatalogItemStatus.LOCKED;
    const { catalogs, useCase } = build([type({ code: 'cargo_type', isSystem: false })], [it0]);

    let key: string | undefined;
    await useCase.execute('cargo_type', it0.id).catch((error: BadRequestException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('catalog.itemDeleteReferencedForbidden');
    expect(catalogs.items).toHaveLength(1);
  });

  it('không tìm thấy mục → 404', async () => {
    const { useCase } = build([type()], []);
    await expect(useCase.execute('cargo_type', 'khong-co')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('mục không thuộc nhóm được chỉ định → 400 catalog.itemTypeMismatch', async () => {
    const it0 = item('cargo_type');
    const { useCase } = build([type({ code: 'cargo_type' })], [it0]);

    let key: string | undefined;
    await useCase.execute('vehicle_type', it0.id).catch((error: BadRequestException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });
    expect(key).toBe('catalog.itemTypeMismatch');
  });
});
