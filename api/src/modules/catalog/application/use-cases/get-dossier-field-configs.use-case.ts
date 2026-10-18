import { Inject, Injectable } from '@nestjs/common';
import {
  DOSSIER_FIELD_CONFIG_REPOSITORY,
  DossierFieldConfigRepository,
} from '../ports/dossier-field-config.repository';
import { DEFAULT_DOSSIER_FIELD_CONFIGS, DossierFieldConfigItem } from '../../domain/dossier-field-config.catalog';

@Injectable()
export class GetDossierFieldConfigsUseCase {
  constructor(
    @Inject(DOSSIER_FIELD_CONFIG_REPOSITORY)
    private readonly fieldConfigRepo: DossierFieldConfigRepository,
  ) {}

  async execute(dossierTypeCode: string): Promise<DossierFieldConfigItem[]> {
    // 1. Lấy tất cả cấu hình đã lưu trong DB cho loại hồ sơ này
    const savedConfigs = await this.fieldConfigRepo.findSavedConfigs(dossierTypeCode);
    const savedMap = new Map<string, (typeof savedConfigs)[0]>();
    savedConfigs.forEach((c) => savedMap.set(c.fieldKey, c));

    // 2. Lấy danh mục chứng từ (DOCUMENT_TYPE) để dựng danh sách chứng từ đính kèm
    const docItems = await this.fieldConfigRepo.listDocumentTypeItems();

    const result: DossierFieldConfigItem[] = [];

    // 3. Ghép các trường mặc định (g1 -> g4)
    for (const def of DEFAULT_DOSSIER_FIELD_CONFIGS) {
      const saved = savedMap.get(def.fieldKey);
      result.push({
        id: saved?.id,
        dossierTypeCode,
        fieldKey: def.fieldKey,
        fieldName: def.fieldName,
        isVisible: def.isDefault ? true : (saved ? saved.isVisible : def.isVisible),
        isRequired: def.isDefault ? true : (saved ? saved.isRequired : def.isRequired),
        isDefault: def.isDefault,
      });
    }

    // 4. Ghép danh sách chứng từ đính kèm
    for (const doc of docItems) {
      const saved = savedMap.get(doc.code);
      result.push({
        id: saved?.id,
        dossierTypeCode,
        fieldKey: doc.code,
        fieldName: doc.name,
        isVisible: saved ? saved.isVisible : true,
        isRequired: saved ? saved.isRequired : false,
        isDefault: false,
      });
    }

    return result;
  }
}
