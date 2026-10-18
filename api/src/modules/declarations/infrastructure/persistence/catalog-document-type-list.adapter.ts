import { Inject, Injectable } from '@nestjs/common';
import { CATALOG_REPOSITORY, CatalogRepository } from '../../../catalog/application/ports/catalog.repository';
import { CatalogItemStatus } from '../../../catalog/domain/catalog-status.enum';
import {
  DOCUMENT_TYPE_LIST_CATALOG_CODE,
  DocumentTypeListCatalogPort,
  DocumentTypeOption,
} from '../../application/ports/document-type-list.port';

/** Số mục tối đa đọc từ danh mục — danh sách loại chứng từ không bao giờ dài tới mức này. */
const MAX_ITEMS = 100;

/**
 * Đọc danh mục **loại chứng từ** (nhóm `DOCUMENT_TYPE`, F04) để web đổ vào ô chọn khi đính kèm tệp.
 *
 * Chỉ lấy mục `ACTIVE` — trùng đúng điều kiện mà `UploadAttachmentUseCase` dùng để chấp nhận
 * `documentTypeCode`, nên mọi mã web hiển thị đều gửi lên được. Tên là dữ liệu danh mục (do quản
 * trị tự sửa), giữ nguyên `item.name`, không dịch qua từ điển i18n.
 */
@Injectable()
export class CatalogDocumentTypeListAdapter implements DocumentTypeListCatalogPort {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
  ) {}

  async listUsable(): Promise<DocumentTypeOption[]> {
    const page = await this.catalogs.findItems({
      typeCode: DOCUMENT_TYPE_LIST_CATALOG_CODE,
      status: CatalogItemStatus.ACTIVE,
      page: 1,
      pageSize: MAX_ITEMS,
    });

    return page.items.map((item) => ({ code: item.code, name: item.name }));
  }
}
