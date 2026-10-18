import { CatalogItem, CatalogType } from '../../domain/catalog.entities';
import { CatalogItemOrmEntity } from './catalog-item.orm-entity';
import { CatalogTypeOrmEntity } from './catalog-type.orm-entity';

export class CatalogMapper {
  static toTypeDomain(row: CatalogTypeOrmEntity): CatalogType {
    return new CatalogType(row.id, row.code, row.name, row.description, row.isSystem, row.sortOrder);
  }

  static toTypePersistence(type: CatalogType): CatalogTypeOrmEntity {
    const row = new CatalogTypeOrmEntity();
    row.id = type.id;
    row.code = type.code;
    row.name = type.name;
    row.description = type.description;
    row.isSystem = type.isSystem;
    row.sortOrder = type.sortOrder;
    return row;
  }

  static toItemDomain(row: CatalogItemOrmEntity): CatalogItem {
    return new CatalogItem(
      row.id,
      row.typeCode,
      row.code,
      row.name,
      row.sortOrder,
      row.status,
      row.metadata,
      row.createdAt,
      row.updatedAt,
    );
  }

  static toItemPersistence(item: CatalogItem): CatalogItemOrmEntity {
    const row = new CatalogItemOrmEntity();
    row.id = item.id;
    row.typeCode = item.typeCode;
    row.code = item.code;
    row.name = item.name;
    row.sortOrder = item.sortOrder;
    row.status = item.status;
    row.metadata = item.metadata;
    row.createdAt = item.createdAt;
    row.updatedAt = item.updatedAt;
    return row;
  }
}
