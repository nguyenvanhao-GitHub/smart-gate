import { CatalogRequiredDocumentAdapter } from './catalog-required-document.adapter';
import { CatalogRepository } from '../../../catalog/application/ports/catalog.repository';
import { DeclarationType } from '../../domain/declaration.enums';
import { GetDossierFieldConfigsUseCase } from '../../../catalog/application/use-cases/get-dossier-field-configs.use-case';

describe('CatalogRequiredDocumentAdapter', () => {
  let adapter: CatalogRequiredDocumentAdapter;
  let catalogs: jest.Mocked<CatalogRepository>;
  let getFieldConfigs: jest.Mocked<GetDossierFieldConfigsUseCase>;

  beforeEach(() => {
    catalogs = {
      findItems: jest.fn().mockResolvedValue({
        items: [
          { code: 'CUSTOMS_DECLARATION', name: 'Tờ khai hải quan', metadata: { dossierTypes: ['EXPORT'] } },
          { code: 'COMMERCIAL_INVOICE', name: 'Hóa đơn thương mại', metadata: { dossierTypes: ['EXPORT'] } },
        ],
        total: 2,
        page: 1,
        pageSize: 100,
      }),
    } as unknown as jest.Mocked<CatalogRepository>;

    getFieldConfigs = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetDossierFieldConfigsUseCase>;

    adapter = new CatalogRequiredDocumentAdapter(catalogs, getFieldConfigs);
  });

  it('khi dossier_field_configs đã tắt hết cờ isRequired cho các loại chứng từ -> trả mảng rỗng', async () => {
    getFieldConfigs.execute.mockResolvedValue([
      { fieldKey: 'CUSTOMS_DECLARATION', fieldName: 'Tờ khai hải quan', isVisible: false, isRequired: false, isDefault: false },
      { fieldKey: 'COMMERCIAL_INVOICE', fieldName: 'Hóa đơn thương mại', isVisible: false, isRequired: false, isDefault: false },
    ]);

    const result = await adapter.listForDossierType(DeclarationType.EXPORT);
    expect(result).toEqual([]);
  });

  it('khi dossier_field_configs bật isRequired cho CUSTOMS_DECLARATION -> chỉ trả CUSTOMS_DECLARATION', async () => {
    getFieldConfigs.execute.mockResolvedValue([
      { fieldKey: 'CUSTOMS_DECLARATION', fieldName: 'Tờ khai hải quan', isVisible: true, isRequired: true, isDefault: false },
      { fieldKey: 'COMMERCIAL_INVOICE', fieldName: 'Hóa đơn thương mại', isVisible: false, isRequired: false, isDefault: false },
    ]);

    const result = await adapter.listForDossierType(DeclarationType.EXPORT);
    expect(result).toEqual([
      { code: 'CUSTOMS_DECLARATION', name: 'Tờ khai hải quan' },
    ]);
  });
});
