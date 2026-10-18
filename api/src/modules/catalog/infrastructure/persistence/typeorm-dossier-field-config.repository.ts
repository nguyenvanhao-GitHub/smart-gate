import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DossierFieldConfigRepository, DossierFieldConfigSaved } from '../../application/ports/dossier-field-config.repository';
import { CatalogItemOrmEntity } from './catalog-item.orm-entity';
import { DossierFieldConfigOrmEntity } from './dossier-field-config.orm-entity';

@Injectable()
export class TypeOrmDossierFieldConfigRepository implements DossierFieldConfigRepository {
  constructor(
    @InjectRepository(DossierFieldConfigOrmEntity)
    private readonly fieldConfigRepo: Repository<DossierFieldConfigOrmEntity>,
    @InjectRepository(CatalogItemOrmEntity)
    private readonly catalogItemRepo: Repository<CatalogItemOrmEntity>,
  ) {}

  async findSavedConfigs(dossierTypeCode: string): Promise<DossierFieldConfigSaved[]> {
    const savedConfigs = await this.fieldConfigRepo.find({ where: { dossierTypeCode } });
    return savedConfigs.map((c) => ({
      id: c.id,
      dossierTypeCode: c.dossierTypeCode ?? dossierTypeCode,
      fieldKey: c.fieldKey,
      isVisible: c.isVisible,
      isRequired: c.isRequired,
      isDefault: c.isDefault,
    }));
  }

  async listDocumentTypeItems(): Promise<Array<{ code: string; name: string }>> {
    const docItems = await this.catalogItemRepo.find({
      where: { typeCode: 'DOCUMENT_TYPE' },
      order: { sortOrder: 'ASC' },
    });
    return (docItems || []).map((d) => ({ code: d.code, name: d.name }));
  }

  async saveConfig(
    dossierTypeCode: string,
    fieldKey: string,
    isVisible: boolean,
    isRequired: boolean,
    isDefault: boolean,
  ): Promise<void> {
    let entity = await this.fieldConfigRepo.findOne({
      where: { dossierTypeCode, fieldKey },
    });
    if (!entity) {
      entity = this.fieldConfigRepo.create({
        dossierTypeCode,
        fieldKey,
        isVisible,
        isRequired,
        isDefault,
      });
    } else {
      entity.isVisible = isVisible;
      entity.isRequired = isRequired;
    }
    await this.fieldConfigRepo.save(entity);
  }
}
