import { Inject, Injectable } from '@nestjs/common';
import { CatalogTypeView } from '../dto/catalog-type.view';
import { CATALOG_REPOSITORY, CatalogRepository } from '../ports/catalog.repository';

@Injectable()
export class ListCatalogTypesUseCase {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
  ) {}

  async execute(): Promise<CatalogTypeView[]> {
    const [types, counts] = await Promise.all([
      this.catalogs.listTypes(),
      this.catalogs.countItemsByType(),
    ]);
    return types.map((type) => ({
      id: type.id,
      code: type.code,
      name: type.name,
      description: type.description,
      isSystem: type.isSystem,
      sortOrder: type.sortOrder,
      itemCount: counts[type.code] ?? 0,
    }));
  }
}
