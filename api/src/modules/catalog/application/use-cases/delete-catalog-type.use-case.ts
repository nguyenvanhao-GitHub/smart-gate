import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { CATALOG_REPOSITORY, CatalogRepository } from '../ports/catalog.repository';
import { appBadRequest, appNotFound } from '../../../../common/i18n';

/**
 * Xóa vật lý một nhóm danh mục (BUG-058). Rào an toàn (không mâu thuẫn F04):
 *
 * 1. Nhóm **mặc định** (`isSystem`, do seed) → chặn: mã nguồn tham chiếu nhóm này theo mã.
 * 2. Nhóm **còn mục bên trong** → chặn: nhóm còn dữ liệu là dấu hiệu đã/đang được dùng. Đây cũng là
 *    rào chống xóa nhầm nhóm đã phát sinh tham chiếu — muốn xóa nhóm thì phải xóa hết mục trước (mà
 *    mỗi mục lại chịu rào riêng ở `DeleteCatalogItemUseCase`). Chỉ nhóm **admin tự thêm & rỗng** mới
 *    xóa được.
 *
 * Ghi vết vào nhật ký kiểm toán.
 */
@Injectable()
export class DeleteCatalogTypeUseCase {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(typeCode: string): Promise<{ deleted: true }> {
    const type = await this.catalogs.findTypeByCode(typeCode);
    if (!type) throw appNotFound('catalog.typeNotFound');
    if (type.isSystem) throw appBadRequest('catalog.typeDeleteSystemForbidden');

    const itemCount = await this.catalogs.countItemsOfType(type.code);
    if (itemCount > 0) throw appBadRequest('catalog.typeDeleteNotEmpty', { count: itemCount });

    await this.catalogs.deleteType(type.id);
    await this.audit.record({
      action: 'CATALOG_TYPE_DELETE',
      targetType: 'CATALOG_TYPE',
      targetId: type.id,
      before: { code: type.code, name: type.name, description: type.description, sortOrder: type.sortOrder },
    });
    return { deleted: true };
  }
}
