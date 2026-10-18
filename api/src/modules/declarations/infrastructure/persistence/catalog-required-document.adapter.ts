import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CATALOG_REPOSITORY, CatalogRepository } from '../../../catalog/application/ports/catalog.repository';
import { CatalogItemStatus } from '../../../catalog/domain/catalog-status.enum';
import { CatalogItem } from '../../../catalog/domain/catalog.entities';
import { DeclarationType } from '../../domain/declaration.enums';
import { RequiredDocumentType } from '../../domain/dossier-completeness.rules';
import {
  REQUIRED_DOCUMENT_CATALOG_CODE,
  RequiredDocumentCatalogPort,
} from '../../application/ports/required-document.port';
import { GetDossierFieldConfigsUseCase } from '../../../catalog/application/use-cases/get-dossier-field-configs.use-case';

/** Số mục tối đa đọc từ danh mục — danh sách chứng từ bắt buộc không bao giờ dài tới mức này. */
const MAX_ITEMS = 100;

/**
 * Đọc **cấu hình** chứng từ bắt buộc.
 *
 * Ưu tiên đọc từ `dossier_field_configs` (cấu hình giao diện động cho từng loại hồ sơ).
 * Nếu chưa có bản lưu trong `dossier_field_configs`, rơi về danh mục dùng chung `REQUIRED_DOCUMENT`.
 */
@Injectable()
export class CatalogRequiredDocumentAdapter implements RequiredDocumentCatalogPort {
  private readonly logger = new Logger(CatalogRequiredDocumentAdapter.name);

  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
    @Optional()
    private readonly getFieldConfigs?: GetDossierFieldConfigsUseCase,
  ) {}

  async listForDossierType(type: DeclarationType): Promise<RequiredDocumentType[]> {
    if (this.getFieldConfigs) {
      const fieldConfigs = await this.getFieldConfigs.execute(type);
      const documentTypeItems = await this.catalogs.findItems({
        typeCode: 'DOCUMENT_TYPE',
        status: CatalogItemStatus.ACTIVE,
        page: 1,
        pageSize: MAX_ITEMS,
      });

      const docNameMap = new Map<string, string>();
      documentTypeItems.items.forEach((item) => docNameMap.set(item.code, item.name));

      const requiredDocsFromConfig: RequiredDocumentType[] = [];
      fieldConfigs.forEach((cfg) => {
        if (cfg.isRequired && docNameMap.has(cfg.fieldKey)) {
          requiredDocsFromConfig.push({
            code: cfg.fieldKey,
            name: docNameMap.get(cfg.fieldKey) || cfg.fieldName || cfg.fieldKey,
          });
        }
      });

      // Nếu đã có cấu hình thuộc nhóm chứng từ trong dossier_field_configs cho loại hồ sơ này
      const hasAnyDocConfig = fieldConfigs.some((cfg) => docNameMap.has(cfg.fieldKey));
      if (hasAnyDocConfig) {
        return requiredDocsFromConfig;
      }
    }

    // Fallback về danh mục cũ REQUIRED_DOCUMENT nếu chưa có bản cấu hình nào trong dossier_field_configs:
    const page = await this.catalogs.findItems({
      typeCode: REQUIRED_DOCUMENT_CATALOG_CODE,
      status: CatalogItemStatus.ACTIVE,
      page: 1,
      pageSize: MAX_ITEMS,
    });

    if (page.total === 0) {
      this.logger.debug(
        `Chưa cấu hình chứng từ bắt buộc cho loại hồ sơ ${type} (danh mục ${REQUIRED_DOCUMENT_CATALOG_CODE} còn trống, chờ chốt điểm D7).`,
      );
      return [];
    }

    return page.items
      .filter((item) => this.appliesTo(item, type))
      .map((item) => ({ code: item.code, name: item.name }));
  }

  private appliesTo(item: CatalogItem, type: DeclarationType): boolean {
    const configured = item.metadata?.dossierTypes;
    if (!Array.isArray(configured) || configured.length === 0) return true;
    return configured.some((value) => String(value).toUpperCase() === type);
  }
}
