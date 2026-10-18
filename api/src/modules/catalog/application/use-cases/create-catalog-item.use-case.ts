import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { CatalogItem } from '../../domain/catalog.entities';
import { CreateCatalogItemCommand } from '../dto/create-catalog-item.command';
import { CATALOG_REPOSITORY, CatalogRepository } from '../ports/catalog.repository';
import { appBadRequest, appNotFound, translate } from '../../../../common/i18n';

@Injectable()
export class CreateCatalogItemUseCase {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: CreateCatalogItemCommand): Promise<CatalogItem> {
    if (!(await this.catalogs.findTypeByCode(command.typeCode))) {
      throw appNotFound('catalog.typeNotFound');
    }

    const code = command.code.trim().toUpperCase();
    if (await this.catalogs.findItemByCode(command.typeCode, code)) {
      throw appBadRequest('catalog.itemCodeDuplicated', undefined, {
        errors: [{ field: 'code', message: translate('catalog.itemCodeDuplicated'), messageKey: 'catalog.itemCodeDuplicated' }],
      });
    }

    const name = command.name.trim();
    if (await this.catalogs.findItemByName(command.typeCode, name)) {
      throw appBadRequest('catalog.itemNameDuplicated', undefined, {
        errors: [{ field: 'name', message: translate('catalog.itemNameDuplicated'), messageKey: 'catalog.itemNameDuplicated' }],
      });
    }

    if (command.sortOrder === undefined || command.sortOrder === null) {
      throw appBadRequest('catalog.itemSortOrderRequired', undefined, {
        errors: [{ field: 'sortOrder', message: translate('catalog.itemSortOrderRequired'), messageKey: 'catalog.itemSortOrderRequired' }],
      });
    }

    if (!Number.isInteger(command.sortOrder) || command.sortOrder < 1) {
      throw appBadRequest('catalog.itemSortOrderInvalid', undefined, {
        errors: [{ field: 'sortOrder', message: translate('catalog.itemSortOrderInvalid'), messageKey: 'catalog.itemSortOrderInvalid' }],
      });
    }

    const sortOrder = command.sortOrder;
    if (await this.catalogs.findItemBySortOrder(command.typeCode, sortOrder)) {
      throw appBadRequest('catalog.itemSortOrderDuplicated', undefined, {
        errors: [{ field: 'sortOrder', message: translate('catalog.itemSortOrderDuplicated'), messageKey: 'catalog.itemSortOrderDuplicated' }],
      });
    }

    const item = await this.catalogs.saveItem(
      CatalogItem.create({
        typeCode: command.typeCode,
        code,
        name,
        sortOrder,
        metadata: command.metadata ?? null,
      }),
    );

    await this.audit.record({
      action: 'CATALOG_ITEM_CREATE',
      targetType: 'CATALOG_ITEM',
      targetId: item.id,
      after: { typeCode: item.typeCode, code: item.code, name: item.name, sortOrder: item.sortOrder },
    });
    return item;
  }
}
