import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { CatalogType } from '../../domain/catalog.entities';
import { CreateCatalogTypeCommand } from '../dto/create-catalog-type.command';
import { CATALOG_REPOSITORY, CatalogRepository } from '../ports/catalog.repository';
import { appBadRequest } from '../../../../common/i18n';

/**
 * Thêm nhóm danh mục dùng chung (F04). Nhóm do quản trị viên tạo là nhóm **thường** (isSystem=false)
 * nên tách được với nhóm nền do seed sinh ra. Mã nhóm là khóa nghiệp vụ, không cho trùng.
 */
@Injectable()
export class CreateCatalogTypeUseCase {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: CreateCatalogTypeCommand): Promise<CatalogType> {
    const code = command.code.trim().toLowerCase();
    if (await this.catalogs.findTypeByCode(code)) {
      throw appBadRequest('catalog.typeCodeDuplicated');
    }

    const name = command.name.trim();
    if (await this.catalogs.findTypeByName(name)) {
      throw appBadRequest('catalog.typeNameDuplicated');
    }

    const type = await this.catalogs.saveType(
      CatalogType.create({
        code,
        name,
        description: command.description?.trim() || null,
        isSystem: false,
        sortOrder: command.sortOrder ?? 0,
      }),
    );

    await this.audit.record({
      action: 'CATALOG_TYPE_CREATE',
      targetType: 'CATALOG_TYPE',
      targetId: type.id,
      after: { code: type.code, name: type.name, description: type.description, sortOrder: type.sortOrder },
    });
    return type;
  }
}
