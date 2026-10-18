import { Inject, Injectable } from '@nestjs/common';
import {
  DOCUMENT_TYPE_LIST_CATALOG,
  DocumentTypeListCatalogPort,
  DocumentTypeOption,
} from '../ports/document-type-list.port';

/**
 * Liệt kê loại chứng từ dùng được để web dựng ô chọn khi đính kèm tệp (F04/F11).
 *
 * Trả cùng tập mã mà `UploadAttachmentUseCase` chấp nhận (mục ACTIVE của danh mục `DOCUMENT_TYPE`),
 * nên người khai chọn loại nào cũng upload được. Danh mục trống → mảng rỗng, web để ô chọn không có
 * lựa chọn và người dùng vẫn upload được vì mã loại là tùy chọn.
 */
@Injectable()
export class ListDocumentTypesUseCase {
  constructor(
    @Inject(DOCUMENT_TYPE_LIST_CATALOG)
    private readonly documentTypes: DocumentTypeListCatalogPort,
  ) {}

  async execute(): Promise<DocumentTypeOption[]> {
    return this.documentTypes.listUsable();
  }
}
