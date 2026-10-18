import { Inject, Injectable } from '@nestjs/common';
import { PaginatedResult } from '../../../../common/http/pagination';
import { CatalogItem } from '../../domain/catalog.entities';
import { CATALOG_REPOSITORY, CatalogItemSearchCriteria, CatalogRepository } from '../ports/catalog.repository';
import { appNotFound } from '../../../../common/i18n';

@Injectable()
export class ListCatalogItemsUseCase {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
  ) {}

  async execute(criteria: CatalogItemSearchCriteria): Promise<PaginatedResult<CatalogItem>> {
    if (!(await this.catalogs.findTypeByCode(criteria.typeCode))) {
      throw appNotFound('catalog.typeNotFound');
    }
    return this.catalogs.findItems(criteria);
  }
}
