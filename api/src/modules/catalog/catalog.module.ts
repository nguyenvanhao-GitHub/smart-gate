import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CATALOG_REPOSITORY } from './application/ports/catalog.repository';
import { DOSSIER_FIELD_CONFIG_REPOSITORY } from './application/ports/dossier-field-config.repository';
import { BorderFacilityService } from './application/services/border-facility.service';
import { CatalogSeedService } from './application/services/catalog-seed.service';
import { CreateCatalogItemUseCase } from './application/use-cases/create-catalog-item.use-case';
import { CreateCatalogTypeUseCase } from './application/use-cases/create-catalog-type.use-case';
import { DeleteCatalogItemUseCase } from './application/use-cases/delete-catalog-item.use-case';
import { DeleteCatalogTypeUseCase } from './application/use-cases/delete-catalog-type.use-case';
import { ListCatalogItemsUseCase } from './application/use-cases/list-catalog-items.use-case';
import { ListCatalogTypesUseCase } from './application/use-cases/list-catalog-types.use-case';
import { ListReasonCodesUseCase } from './application/use-cases/list-reason-codes.use-case';
import { LockCatalogItemUseCase } from './application/use-cases/lock-catalog-item.use-case';
import { UnlockCatalogItemUseCase } from './application/use-cases/unlock-catalog-item.use-case';
import { UpdateCatalogItemUseCase } from './application/use-cases/update-catalog-item.use-case';
import { UpdateCatalogTypeUseCase } from './application/use-cases/update-catalog-type.use-case';
import { GetDossierFieldConfigsUseCase } from './application/use-cases/get-dossier-field-configs.use-case';
import { UpdateDossierFieldConfigsUseCase } from './application/use-cases/update-dossier-field-configs.use-case';
import { CatalogItemOrmEntity } from './infrastructure/persistence/catalog-item.orm-entity';
import { CatalogTypeOrmEntity } from './infrastructure/persistence/catalog-type.orm-entity';
import { DossierFieldConfigOrmEntity } from './infrastructure/persistence/dossier-field-config.orm-entity';
import { TypeOrmCatalogRepository } from './infrastructure/persistence/typeorm-catalog.repository';
import { TypeOrmDossierFieldConfigRepository } from './infrastructure/persistence/typeorm-dossier-field-config.repository';
import { BorderFacilityController } from './presentation/http/border-facility.controller';
import { CatalogsController } from './presentation/http/catalogs.controller';
import { ReasonCodesController } from './presentation/http/reason-codes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CatalogTypeOrmEntity, CatalogItemOrmEntity, DossierFieldConfigOrmEntity])],
  controllers: [CatalogsController, ReasonCodesController, BorderFacilityController],
  providers: [
    { provide: CATALOG_REPOSITORY, useClass: TypeOrmCatalogRepository },
    { provide: DOSSIER_FIELD_CONFIG_REPOSITORY, useClass: TypeOrmDossierFieldConfigRepository },
    CatalogSeedService,
    BorderFacilityService,
    ListCatalogTypesUseCase,
    CreateCatalogTypeUseCase,
    UpdateCatalogTypeUseCase,
    ListCatalogItemsUseCase,
    ListReasonCodesUseCase,
    CreateCatalogItemUseCase,
    UpdateCatalogItemUseCase,
    LockCatalogItemUseCase,
    UnlockCatalogItemUseCase,
    DeleteCatalogItemUseCase,
    DeleteCatalogTypeUseCase,
    GetDossierFieldConfigsUseCase,
    UpdateDossierFieldConfigsUseCase,
  ],
  exports: [CATALOG_REPOSITORY, DOSSIER_FIELD_CONFIG_REPOSITORY, BorderFacilityService, GetDossierFieldConfigsUseCase],
})
export class CatalogModule {}
