import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { CatalogType } from '../../domain/catalog.entities';
import { UpdateCatalogTypeCommand } from '../dto/update-catalog-type.command';
import { CATALOG_REPOSITORY, CatalogRepository } from '../ports/catalog.repository';
import { appBadRequest, appNotFound } from '../../../../common/i18n';

/**
 * Sửa nội dung nhóm danh mục (tên/mô tả/thứ tự). Mã nhóm là khóa nghiệp vụ đã đi vào dữ liệu hồ sơ
 * nên **không** cho đổi; nhóm hệ thống vẫn sửa được tên/mô tả để quản trị viên chỉnh nhãn hiển thị.
 */
@Injectable()
export class UpdateCatalogTypeUseCase {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: UpdateCatalogTypeCommand): Promise<CatalogType> {
    const type = await this.catalogs.findTypeByCode(command.typeCode);
    if (!type) throw appNotFound('catalog.typeNotFound');

    const name = command.name?.trim();
    if (name !== undefined) {
      const sameName = await this.catalogs.findTypeByName(name);
      if (sameName && sameName.id !== type.id) {
        throw appBadRequest('catalog.typeNameDuplicated');
      }
    }

    const before = { name: type.name, description: type.description, sortOrder: type.sortOrder };
    type.update({
      name,
      description: command.description === undefined ? undefined : command.description?.trim() || null,
      sortOrder: command.sortOrder,
    });
    const saved = await this.catalogs.saveType(type);

    await this.audit.record({
      action: 'CATALOG_TYPE_UPDATE',
      targetType: 'CATALOG_TYPE',
      targetId: saved.id,
      before,
      after: { name: saved.name, description: saved.description, sortOrder: saved.sortOrder },
    });
    return saved;
  }
}
