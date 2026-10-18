import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { CatalogItem } from '../../domain/catalog.entities';
import { UpdateCatalogItemCommand } from '../dto/update-catalog-item.command';
import { CATALOG_REPOSITORY, CatalogRepository } from '../ports/catalog.repository';
import { appBadRequest, appNotFound, translate } from '../../../../common/i18n';

@Injectable()
export class UpdateCatalogItemUseCase {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: UpdateCatalogItemCommand): Promise<CatalogItem> {
    const item = await this.catalogs.findItemById(command.itemId);
    if (!item) throw appNotFound('catalog.itemNotFound');
    if (item.typeCode !== command.typeCode) {
      throw appBadRequest('catalog.itemTypeMismatch');
    }

    const name = command.name?.trim();
    if (name !== undefined) {
      const sameName = await this.catalogs.findItemByName(command.typeCode, name);
      if (sameName && sameName.id !== item.id) {
        throw appBadRequest('catalog.itemNameDuplicated', undefined, {
          errors: [{ field: 'name', message: translate('catalog.itemNameDuplicated'), messageKey: 'catalog.itemNameDuplicated' }],
        });
      }
    }

    if (command.sortOrder !== undefined) {
      if (command.sortOrder === null || !Number.isInteger(command.sortOrder) || command.sortOrder < 1) {
        throw appBadRequest('catalog.itemSortOrderInvalid', undefined, {
          errors: [{ field: 'sortOrder', message: translate('catalog.itemSortOrderInvalid'), messageKey: 'catalog.itemSortOrderInvalid' }],
        });
      }

      const sameSortOrder = await this.catalogs.findItemBySortOrder(command.typeCode, command.sortOrder);
      if (sameSortOrder && sameSortOrder.id !== item.id) {
        throw appBadRequest('catalog.itemSortOrderDuplicated', undefined, {
          errors: [
            {
              field: 'sortOrder',
              message: translate('catalog.itemSortOrderDuplicated'),
              messageKey: 'catalog.itemSortOrderDuplicated',
            },
          ],
        });
      }
    }

    const before = { name: item.name, sortOrder: item.sortOrder, metadata: item.metadata };
    item.update({ name, sortOrder: command.sortOrder, metadata: command.metadata });
    const saved = await this.catalogs.saveItem(item);

    await this.audit.record({
      action: 'CATALOG_ITEM_UPDATE',
      targetType: 'CATALOG_ITEM',
      targetId: saved.id,
      before,
      after: { name: saved.name, sortOrder: saved.sortOrder, metadata: saved.metadata },
    });
    return saved;
  }
}
