import { Inject, Injectable } from '@nestjs/common';
import { CATALOG_REPOSITORY, CatalogRepository } from '../../../catalog/application/ports/catalog.repository';
import { CatalogItemStatus } from '../../../catalog/domain/catalog-status.enum';
import {
  REASON_SCOPE_CATALOG_TYPES,
  ReasonCodeView,
  ReasonScope,
} from '../../../catalog/domain/reason-code.catalog';
import { FeeReasonCodeCatalogPort } from '../../application/ports/fee-reason-code.port';

/** Mã lý do điều chỉnh phí là **dữ liệu danh mục** — luôn đọc lại từ bảng `catalog_items`. */
@Injectable()
export class CatalogFeeReasonAdapter implements FeeReasonCodeCatalogPort {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
  ) {}

  async findActiveAdjustReason(code: string): Promise<ReasonCodeView | null> {
    const item = await this.catalogs.findItemByCode(REASON_SCOPE_CATALOG_TYPES[ReasonScope.FEE_ADJUST], code);
    if (!item || item.status !== CatalogItemStatus.ACTIVE) return null;
    return { code: item.code, name: item.name, scope: ReasonScope.FEE_ADJUST, active: true };
  }
}
