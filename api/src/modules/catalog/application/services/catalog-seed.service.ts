import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { CATALOG_SEED } from '../../domain/catalog.seed';
import { CATALOG_REPOSITORY, CatalogRepository } from '../ports/catalog.repository';

@Injectable()
export class CatalogSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogSeedService.name);

  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.catalogs.ensure(CATALOG_SEED);
    this.logger.log(`Đã đồng bộ ${CATALOG_SEED.length} nhóm danh mục dùng chung.`);
  }
}
