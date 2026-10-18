import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditEntryInput, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { PaginatedResult } from '../../../../common/http/pagination';
import { CatalogItem, CatalogType } from '../../domain/catalog.entities';
import { CatalogItemSearchCriteria, CatalogRepository } from '../ports/catalog.repository';
import { DeleteCatalogTypeUseCase } from './delete-catalog-type.use-case';

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
  async findItemById(): Promise<CatalogItem | null> {
    return null;
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
  async deleteItem(): Promise<void> {
    return;
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
 * BUG-058 — xóa nhóm danh mục có rào: chỉ nhóm admin tự thêm (không mặc định) và **rỗng** mới xóa được;
 * nhóm mặc định hoặc còn mục bị chặn (400).
 */
describe('DeleteCatalogTypeUseCase — xóa nhóm danh mục có rào (BUG-058)', () => {
  function build(types: CatalogType[], items: CatalogItem[] = []) {
    const catalogs = new FakeCatalogRepository(types, items);
    const audit = new RecordingAudit();
    return { catalogs, audit, useCase: new DeleteCatalogTypeUseCase(catalogs, audit) };
  }

  function type(overrides: Partial<{ code: string; isSystem: boolean }> = {}): CatalogType {
    return CatalogType.create({
      code: overrides.code ?? 'partner',
      name: 'Đối tác',
      isSystem: overrides.isSystem ?? false,
    });
  }

  it('xóa nhóm admin tự thêm & rỗng → xóa khỏi kho và ghi nhật ký', async () => {
    const { catalogs, audit, useCase } = build([type({ code: 'partner', isSystem: false })]);

    const result = await useCase.execute('partner');

    expect(result).toEqual({ deleted: true });
    expect(catalogs.types).toHaveLength(0);
    expect(audit.entries.some((entry) => entry.action === 'CATALOG_TYPE_DELETE')).toBe(true);
  });

  it('KHÔNG cho xóa nhóm MẶC ĐỊNH (isSystem) → 400, không xóa', async () => {
    const { catalogs, audit, useCase } = build([type({ code: 'document_type', isSystem: true })]);

    let key: string | undefined;
    await useCase.execute('document_type').catch((error: BadRequestException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('catalog.typeDeleteSystemForbidden');
    expect(catalogs.types).toHaveLength(1);
    expect(audit.entries).toEqual([]);
  });

  it('KHÔNG cho xóa nhóm CÒN MỤC → 400, không xóa', async () => {
    const t0 = type({ code: 'partner', isSystem: false });
    const it0 = CatalogItem.create({ typeCode: 'partner', code: 'ABC', name: 'Công ty ABC' });
    const { catalogs, useCase } = build([t0], [it0]);

    let key: string | undefined;
    await useCase.execute('partner').catch((error: BadRequestException) => {
      key = (error.getResponse() as { messageKey: string }).messageKey;
    });

    expect(key).toBe('catalog.typeDeleteNotEmpty');
    expect(catalogs.types).toHaveLength(1);
  });

  it('không tìm thấy nhóm → 404', async () => {
    const { useCase } = build([]);
    await expect(useCase.execute('khong-co')).rejects.toBeInstanceOf(NotFoundException);
  });
});
