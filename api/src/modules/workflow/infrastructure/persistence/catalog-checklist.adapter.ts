import { Inject, Injectable } from '@nestjs/common';
import { MAX_PAGE_SIZE } from '../../../../common/http/pagination';
import { toText } from '../../../../common/text/to-text';
import { CATALOG_REPOSITORY, CatalogRepository } from '../../../catalog/application/ports/catalog.repository';
import { CatalogItemStatus } from '../../../catalog/domain/catalog-status.enum';
import { ChecklistDefinition, WorkflowChecklistCatalog } from '../../application/ports/workflow-checklist.port';

/** Mã loại danh mục chứa các mục kiểm tra của màn hình xử lý nghiệp vụ (UI-07). */
const CHECKLIST_TYPE_CODE = 'WORKFLOW_CHECKLIST';

/**
 * Danh sách mục kiểm tra lấy từ danh mục nên **sửa được qua màn hình quản trị**: thêm mục, đổi
 * nhãn, đổi lực lượng phụ trách hay bỏ tính bắt buộc đều không cần deploy lại.
 */
@Injectable()
export class CatalogChecklistAdapter implements WorkflowChecklistCatalog {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
  ) {}

  async listDefinitions(): Promise<ChecklistDefinition[]> {
    const page = await this.catalogs.findItems({
      typeCode: CHECKLIST_TYPE_CODE,
      status: CatalogItemStatus.ACTIVE,
      page: 1,
      pageSize: MAX_PAGE_SIZE,
    });
    return page.items.map((item) => ({
      code: item.code,
      label: item.name,
      agencyCode: toText(item.metadata?.agencyCode),
      required: item.metadata?.required === true,
    }));
  }
}
