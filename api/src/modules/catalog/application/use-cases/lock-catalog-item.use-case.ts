import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { CatalogItem } from '../../domain/catalog.entities';
import { CATALOG_REPOSITORY, CatalogRepository } from '../ports/catalog.repository';
import { appBadRequest, appNotFound } from '../../../../common/i18n';

/**
 * Khóa mục danh mục — thay cho xóa vật lý. F04 quy định danh mục đã phát sinh dữ liệu chỉ được
 * khóa, nên toàn hệ thống **không có** API xóa mục danh mục.
 */
@Injectable()
export class LockCatalogItemUseCase {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(typeCode: string, itemId: string): Promise<CatalogItem> {
    const item = await this.catalogs.findItemById(itemId);
    if (!item) throw appNotFound('catalog.itemNotFound');
    if (item.typeCode !== typeCode) throw appBadRequest('catalog.itemTypeMismatch');

    // Nhóm danh mục **mặc định** (seed, `isSystem`) là dữ liệu lõi mà mã nguồn phụ thuộc theo mã
    // (DOCUMENT_TYPE, DOSSIER_TYPE, COUNTRY…); khóa một mục của nó sẽ làm vỡ tính năng. Chặn tại BE,
    // không chỉ ẩn nút ở giao diện.
    const type = await this.catalogs.findTypeByCode(typeCode);
    if (type?.isSystem) throw appBadRequest('catalog.lockSystemForbidden');

    const before = { name: item.name, code: item.code, typeCode: item.typeCode, status: item.status };
    item.lock();
    const saved = await this.catalogs.saveItem(item);

    await this.audit.record({
      action: 'CATALOG_ITEM_LOCK',
      targetType: 'CATALOG_ITEM',
      targetId: saved.id,
      before,
      after: { name: saved.name, code: saved.code, typeCode: saved.typeCode, status: saved.status },
    });
    return saved;
  }
}
