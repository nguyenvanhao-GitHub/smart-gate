import { Inject, Injectable } from '@nestjs/common';
import { CATALOG_REPOSITORY, CatalogRepository } from '../../../catalog/application/ports/catalog.repository';
import { CatalogItemStatus } from '../../../catalog/domain/catalog-status.enum';
import {
  REASON_SCOPE_CATALOG_TYPES,
  ReasonCodeView,
  ReasonScope,
} from '../../../catalog/domain/reason-code.catalog';
import { ReasonCodeCatalogPort } from '../../application/ports/reason-code.port';

/** Mã nguyên nhân là **dữ liệu danh mục**, không phải enum — luôn đọc lại từ bảng `catalog_items`. */
@Injectable()
export class CatalogReasonCodeAdapter implements ReasonCodeCatalogPort {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
  ) {}

  async findActive(scope: ReasonScope, code: string): Promise<ReasonCodeView | null> {
    const item = await this.catalogs.findItemByCode(REASON_SCOPE_CATALOG_TYPES[scope], code);
    if (!item || item.status !== CatalogItemStatus.ACTIVE) return null;
    return { code: item.code, name: item.name, scope, active: true };
  }
}
