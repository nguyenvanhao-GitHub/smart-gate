import { Test, TestingModule } from '@nestjs/testing';
import { GetDossierFieldConfigsUseCase } from './get-dossier-field-configs.use-case';
import {
  DOSSIER_FIELD_CONFIG_REPOSITORY,
  DossierFieldConfigRepository,
} from '../ports/dossier-field-config.repository';
import { DEFAULT_DOSSIER_FIELD_CONFIGS } from '../../domain/dossier-field-config.catalog';

describe('GetDossierFieldConfigsUseCase', () => {
  let useCase: GetDossierFieldConfigsUseCase;
  let repoMock: jest.Mocked<DossierFieldConfigRepository>;

  beforeEach(async () => {
    repoMock = {
      findSavedConfigs: jest.fn().mockResolvedValue([]),
      listDocumentTypeItems: jest.fn().mockResolvedValue([]),
      saveConfig: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetDossierFieldConfigsUseCase,
        {
          provide: DOSSIER_FIELD_CONFIG_REPOSITORY,
          useValue: repoMock,
        },
      ],
    }).compile();

    useCase = module.get<GetDossierFieldConfigsUseCase>(GetDossierFieldConfigsUseCase);
  });

  it('should return merged field configs if found in DB', async () => {
    const existing = [
      {
        id: 'cfg-1',
        dossierTypeCode: 'IMPORT',
        fieldKey: 'accountInfo',
        isVisible: false,
        isRequired: false,
        isDefault: false,
      },
    ];
    repoMock.findSavedConfigs.mockResolvedValue(existing);

    const result = await useCase.execute('IMPORT');

    expect(result.length).toBeGreaterThanOrEqual(DEFAULT_DOSSIER_FIELD_CONFIGS.length);
    const accountInfoConfig = result.find((c) => c.fieldKey === 'accountInfo');
    expect(accountInfoConfig?.isVisible).toBe(false);
    expect(repoMock.findSavedConfigs).toHaveBeenCalledWith('IMPORT');
  });
});
