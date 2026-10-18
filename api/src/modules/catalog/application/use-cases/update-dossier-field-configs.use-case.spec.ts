import { Test, TestingModule } from '@nestjs/testing';
import { UpdateDossierFieldConfigsUseCase } from './update-dossier-field-configs.use-case';
import { GetDossierFieldConfigsUseCase } from './get-dossier-field-configs.use-case';
import {
  DOSSIER_FIELD_CONFIG_REPOSITORY,
  DossierFieldConfigRepository,
} from '../ports/dossier-field-config.repository';

describe('UpdateDossierFieldConfigsUseCase', () => {
  let useCase: UpdateDossierFieldConfigsUseCase;
  let repoMock: jest.Mocked<DossierFieldConfigRepository>;
  let getDossierFieldConfigsMock: any;

  beforeEach(async () => {
    repoMock = {
      findSavedConfigs: jest.fn().mockResolvedValue([]),
      listDocumentTypeItems: jest.fn().mockResolvedValue([]),
      saveConfig: jest.fn().mockResolvedValue(undefined),
    };

    getDossierFieldConfigsMock = {
      execute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateDossierFieldConfigsUseCase,
        {
          provide: DOSSIER_FIELD_CONFIG_REPOSITORY,
          useValue: repoMock,
        },
        {
          provide: GetDossierFieldConfigsUseCase,
          useValue: getDossierFieldConfigsMock,
        },
      ],
    }).compile();

    useCase = module.get<UpdateDossierFieldConfigsUseCase>(UpdateDossierFieldConfigsUseCase);
  });

  it('should update and save field configurations', async () => {
    const existing = [
      {
        id: 'cfg-1',
        dossierTypeCode: 'IMPORT',
        fieldKey: 'representative',
        fieldName: 'Người đại diện',
        isVisible: true,
        isRequired: false,
        isDefault: false,
      },
    ];
    getDossierFieldConfigsMock.execute.mockResolvedValue(existing);

    const result = await useCase.execute('IMPORT', [
      {
        fieldKey: 'representative',
        isVisible: false,
        isRequired: false,
      },
    ]);

    expect(repoMock.saveConfig).toHaveBeenCalledWith('IMPORT', 'representative', false, false, false);
    expect(result).toEqual(existing);
  });
});
