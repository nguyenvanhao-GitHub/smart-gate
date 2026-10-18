import { Inject, Injectable } from '@nestjs/common';
import { MAX_PAGE_SIZE } from '../../../../common/http/pagination';
import { CATALOG_REPOSITORY, CatalogRepository } from '../../../catalog/application/ports/catalog.repository';
import { CatalogItemStatus } from '../../../catalog/domain/catalog-status.enum';
import { GateChecklistCatalog, GateChecklistDefinition } from '../../application/ports/gate-checklist.port';

/** Mã loại danh mục chứa mục kiểm tra tại cổng (UI-09). */
const GATE_CHECKLIST_TYPE_CODE = 'GATE_CHECKLIST';

/**
 * Checklist tại cổng lấy từ danh mục nên **sửa được qua màn hình quản trị**: thêm mục, đổi nhãn
 * hay bỏ tính bắt buộc đều không cần deploy. Mục bị khóa thì không còn hiện ra cổng nữa.
 */
@Injectable()
export class CatalogGateChecklistAdapter implements GateChecklistCatalog {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
  ) {}

  async listDefinitions(): Promise<GateChecklistDefinition[]> {
    const page = await this.catalogs.findItems({
      typeCode: GATE_CHECKLIST_TYPE_CODE,
      status: CatalogItemStatus.ACTIVE,
      page: 1,
      pageSize: MAX_PAGE_SIZE,
    });
    return page.items.map((item) => ({
      code: item.code,
      label: item.name,
      required: item.metadata?.required === true,
    }));
  }
}
