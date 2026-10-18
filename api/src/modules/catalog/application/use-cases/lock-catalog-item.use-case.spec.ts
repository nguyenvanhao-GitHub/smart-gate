import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { PaginatedResult } from '../../../../common/http/pagination';
import { CatalogItemStatus } from '../../domain/catalog-status.enum';
import { CatalogItem, CatalogType } from '../../domain/catalog.entities';
import { CatalogItemSearchCriteria, CatalogRepository } from '../ports/catalog.repository';
import { LockCatalogItemUseCase } from './lock-catalog-item.use-case';

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
  async countItemsByType(): Promise<Record<string, number>> {
    return {};
  }
  async countItemsOfType(typeCode: string): Promise<number> {
    return this.items.filter((item) => item.typeCode === typeCode).length;
  }
  async deleteType(id: string): Promise<void> {
    const index = this.types.findIndex((type) => type.id === id);
    if (index >= 0) this.types.splice(index, 1);
  }
  async deleteItem(id: string): Promise<void> {
    const index = this.items.findIndex((item) => item.id === id);
    if (index >= 0) this.items.splice(index, 1);
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
    const index = this.items.findIndex((current) => current.id === item.id);
    if (index >= 0) this.items[index] = item;
    else this.items.push(item);
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

/**
 * F04 — khóa mục danh mục (thay cho xóa vật lý). Bổ sung: mục thuộc nhóm **mặc định** (`isSystem`)
 * không được khóa vì mã nguồn phụ thuộc dữ liệu lõi này theo mã.
 */
describe('LockCatalogItemUseCase — khóa mục danh mục (F04)', () => {
  function build(types: CatalogType[], items: CatalogItem[]) {
    const catalogs = new FakeCatalogRepository(types, items);
    const audit = new RecordingAudit();
    return { catalogs, audit, useCase: new LockCatalogItemUseCase(catalogs, audit) };
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

  it('khóa mục của nhóm THƯỜNG → chuyển LOCKED và ghi nhật ký', async () => {
    const it0 = item('cargo_type');
    const { catalogs, audit, useCase } = build([type({ code: 'cargo_type', isSystem: false })], [it0]);

    const saved = await useCase.execute('cargo_type', it0.id);

    expect(saved.status).toBe(CatalogItemStatus.LOCKED);
    expect(catalogs.items[0].status).toBe(CatalogItemStatus.LOCKED);
    expect(audit.entries.some((entry) => entry.action === 'CATALOG_ITEM_LOCK')).toBe(true);
  });

  it('KHÔNG cho khóa mục của nhóm MẶC ĐỊNH (isSystem) → 400 catalog.lockSystemForbidden, không đổi trạng thái, không ghi nhật ký', async () => {
    const it0 = item('document_type');
    const { catalogs, audit, useCase } = build([type({ code: 'document_type', isSystem: true })], [it0]);

    let key: string | undefined;
    await useCase.execute('document_type', it0.id).catch((error: BadRequestException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('catalog.lockSystemForbidden');
    expect(catalogs.items[0].status).toBe(CatalogItemStatus.ACTIVE);
    expect(audit.entries).toEqual([]);
  });

  it('không tìm thấy mục → 404 catalog.itemNotFound', async () => {
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
