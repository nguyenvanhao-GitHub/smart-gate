import { Inject, Injectable } from '@nestjs/common';
import { CATALOG_REPOSITORY, CatalogRepository } from '../../../catalog/application/ports/catalog.repository';
import { CatalogItemStatus } from '../../../catalog/domain/catalog-status.enum';
import {
  DOCUMENT_TYPE_CATALOG_CODE,
  DocumentTypeCatalogPort,
} from '../../application/ports/document-type-catalog.port';

/** Hiện thực `DOCUMENT_TYPE_CATALOG` trên danh mục dùng chung (F04). Mục bị khóa thì không dùng được. */
@Injectable()
export class CatalogDocumentTypeAdapter implements DocumentTypeCatalogPort {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
  ) {}

  async isUsable(code: string): Promise<boolean> {
    const item = await this.catalogs.findItemByCode(DOCUMENT_TYPE_CATALOG_CODE, code);
    return !!item && item.status === CatalogItemStatus.ACTIVE;
  }

  /** Tra tên loại chứng từ để phản hồi khớp đường tải-lại hồ sơ (`fileName`/`documentTypeName`). */
  async nameOf(code: string): Promise<string | null> {
    const item = await this.catalogs.findItemByCode(DOCUMENT_TYPE_CATALOG_CODE, code);
    return item?.name ?? null;
  }
}
