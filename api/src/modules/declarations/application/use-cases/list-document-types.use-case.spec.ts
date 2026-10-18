import { DocumentTypeListCatalogPort, DocumentTypeOption } from '../ports/document-type-list.port';
import { ListDocumentTypesUseCase } from './list-document-types.use-case';

/** Cổng danh mục trong bộ nhớ — trả đúng danh sách được nạp. */
class FakeDocumentTypeListCatalog implements DocumentTypeListCatalogPort {
  constructor(private readonly options: DocumentTypeOption[] = []) {}
  async listUsable(): Promise<DocumentTypeOption[]> {
    return this.options;
  }
}

describe('Liệt kê loại chứng từ (F04/F11)', () => {
  it('trả đúng các loại chứng từ đang dùng được từ danh mục', async () => {
    const options: DocumentTypeOption[] = [
      { code: 'CUSTOMS_DECLARATION', name: 'Tờ khai hải quan' },
      { code: 'COMMERCIAL_INVOICE', name: 'Hóa đơn thương mại' },
    ];
    const useCase = new ListDocumentTypesUseCase(new FakeDocumentTypeListCatalog(options));

    await expect(useCase.execute()).resolves.toEqual(options);
  });

  it('trả mảng rỗng khi danh mục trống', async () => {
    const useCase = new ListDocumentTypesUseCase(new FakeDocumentTypeListCatalog([]));

    await expect(useCase.execute()).resolves.toEqual([]);
  });
});
