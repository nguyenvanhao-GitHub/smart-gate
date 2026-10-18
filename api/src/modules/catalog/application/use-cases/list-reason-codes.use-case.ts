import { Inject, Injectable } from '@nestjs/common';
import { MAX_PAGE_SIZE } from '../../../../common/http/pagination';
import { CatalogItemStatus } from '../../domain/catalog-status.enum';
import { REASON_SCOPE_CATALOG_TYPES, ReasonCodeView, ReasonScope } from '../../domain/reason-code.catalog';
import { CATALOG_REPOSITORY, CatalogRepository } from '../ports/catalog.repository';

/**
 * Danh mục mã nguyên nhân cho 4 tình huống của SRS 7.2 (điểm D9).
 * Không có `scope` thì trả cả 4 nhóm — màn hình xử lý nghiệp vụ nạp một lần rồi lọc tại chỗ.
 */
@Injectable()
export class ListReasonCodesUseCase {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
  ) {}

  async execute(scope?: ReasonScope): Promise<ReasonCodeView[]> {
    const scopes = scope ? [scope] : (Object.values(ReasonScope) as ReasonScope[]);
    const results: ReasonCodeView[] = [];
    for (const current of scopes) {
      const page = await this.catalogs.findItems({
        typeCode: REASON_SCOPE_CATALOG_TYPES[current],
        page: 1,
        pageSize: MAX_PAGE_SIZE,
      });
      page.items.forEach((item) =>
        results.push({
          code: item.code,
          name: item.name,
          scope: current,
          active: item.status === CatalogItemStatus.ACTIVE,
        }),
      );
    }
    return results;
  }
}
