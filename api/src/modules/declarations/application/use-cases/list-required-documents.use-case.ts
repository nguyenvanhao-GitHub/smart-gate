import { Inject, Injectable } from '@nestjs/common';
import { DeclarationType } from '../../domain/declaration.enums';
import {
  REQUIRED_DOCUMENT_CATALOG,
  RequiredDocumentCatalogPort,
} from '../ports/required-document.port';

/** Một chứng từ bắt buộc theo loại hồ sơ (F13). Tên trường khớp contract web `RequiredDocument`. */
export interface RequiredDocumentView {
  documentTypeCode: string;
  documentTypeName: string;
  required: true;
}

/**
 * Liệt kê chứng từ bắt buộc của một loại hồ sơ (F13) để web hiện checklist ở UI-04/UI-05.
 *
 * Đọc cùng nguồn cấu hình mà `validateDossierCompleteness` dùng để chặn gửi, nên danh sách hiển
 * thị và danh sách chặn **luôn khớp nhau theo cấu tạo**. Danh mục trống (D7 chưa chốt đầy đủ cho
 * loại nào đó) → trả mảng rỗng, web không hiện gì và cũng không chặn — nhất quán.
 */
@Injectable()
export class ListRequiredDocumentsUseCase {
  constructor(
    @Inject(REQUIRED_DOCUMENT_CATALOG)
    private readonly requiredDocuments: RequiredDocumentCatalogPort,
  ) {}

  async execute(dossierType: DeclarationType): Promise<RequiredDocumentView[]> {
    const documents = await this.requiredDocuments.listForDossierType(dossierType);
    return documents.map((document) => ({
      documentTypeCode: document.code,
      documentTypeName: document.name,
      required: true,
    }));
  }
}
