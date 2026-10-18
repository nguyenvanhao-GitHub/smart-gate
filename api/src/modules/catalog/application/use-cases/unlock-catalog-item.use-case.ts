import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { CatalogItem } from '../../domain/catalog.entities';
import { CATALOG_REPOSITORY, CatalogRepository } from '../ports/catalog.repository';
import { appBadRequest, appNotFound } from '../../../../common/i18n';

@Injectable()
export class UnlockCatalogItemUseCase {
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

    const before = { name: item.name, code: item.code, typeCode: item.typeCode, status: item.status };
    item.unlock();
    const saved = await this.catalogs.saveItem(item);

    await this.audit.record({
      action: 'CATALOG_ITEM_UNLOCK',
      targetType: 'CATALOG_ITEM',
      targetId: saved.id,
      before,
      after: { name: saved.name, code: saved.code, typeCode: saved.typeCode, status: saved.status },
    });
    return saved;
  }
}
