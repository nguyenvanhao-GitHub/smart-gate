import { Inject, Injectable } from '@nestjs/common';
import {
  DOSSIER_FIELD_CONFIG_REPOSITORY,
  DossierFieldConfigRepository,
} from '../ports/dossier-field-config.repository';
import { GetDossierFieldConfigsUseCase } from './get-dossier-field-configs.use-case';
import { DossierFieldConfigItem } from '../../domain/dossier-field-config.catalog';

export interface UpdateDossierFieldConfigInput {
  fieldKey: string;
  isVisible: boolean;
  isRequired: boolean;
}

@Injectable()
export class UpdateDossierFieldConfigsUseCase {
  constructor(
    @Inject(DOSSIER_FIELD_CONFIG_REPOSITORY)
    private readonly fieldConfigRepo: DossierFieldConfigRepository,
    private readonly getConfigs: GetDossierFieldConfigsUseCase,
  ) {}

  async execute(dossierTypeCode: string, inputs: UpdateDossierFieldConfigInput[]): Promise<DossierFieldConfigItem[]> {
    const current = await this.getConfigs.execute(dossierTypeCode);
    const currentMap = new Map<string, DossierFieldConfigItem>();
    current.forEach((item) => currentMap.set(item.fieldKey, item));

    for (const input of inputs) {
      const existingDef = currentMap.get(input.fieldKey);
      if (existingDef?.isDefault) {
        // Trường default không cho thay đổi
        continue;
      }

      const isVisible = input.isVisible;
      // Bỏ chọn Hiển thị sẽ tự bỏ chọn Bắt buộc
      const isRequired = isVisible ? input.isRequired : false;

      await this.fieldConfigRepo.saveConfig(
        dossierTypeCode,
        input.fieldKey,
        isVisible,
        isRequired,
        existingDef?.isDefault ?? false,
      );
    }

    return this.getConfigs.execute(dossierTypeCode);
  }
}
