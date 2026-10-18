import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { CatalogItemStatus } from '../../domain/catalog-status.enum';
import { CATALOG_REPOSITORY, CatalogRepository } from '../ports/catalog.repository';
import { appBadRequest, appNotFound } from '../../../../common/i18n';

/**
 * Xóa vật lý một mục danh mục (BUG-058). F04 quy định danh mục **đã phát sinh dữ liệu chỉ được khóa**,
 * nên xóa cứng chỉ mở cho mục **do quản trị viên tự thêm và chưa được dùng**. Rào an toàn:
 *
 * 1. Mục thuộc nhóm **mặc định** (`isSystem`) → chặn: dữ liệu lõi mã nguồn phụ thuộc theo mã.
 * 2. Mục **đã khóa** (`LOCKED`) → chặn: theo F04, mục chỉ bị khóa khi đã phát sinh dữ liệu, nên
 *    trạng thái khóa là dấu hiệu "đã dùng"; chỉ được khóa, không được xóa. Đây là **rào tối thiểu**
 *    theo mã trạng thái vì tham chiếu danh mục nằm rải rác (mã chứng từ trong tệp đính kèm, mã lý do
 *    trong quyết định liên ngành…) không tra gọn được ở một chỗ — thà chặn nhầm còn hơn cho xóa nhầm.
 *
 * Ghi vết vào nhật ký kiểm toán (before = bản ghi bị xóa) để truy được ai xóa gì.
 */
@Injectable()
export class DeleteCatalogItemUseCase {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(typeCode: string, itemId: string): Promise<{ deleted: true }> {
    const item = await this.catalogs.findItemById(itemId);
    if (!item) throw appNotFound('catalog.itemNotFound');
    if (item.typeCode !== typeCode) throw appBadRequest('catalog.itemTypeMismatch');

    const type = await this.catalogs.findTypeByCode(typeCode);
    if (type?.isSystem) throw appBadRequest('catalog.itemDeleteSystemForbidden');
    if (item.status === CatalogItemStatus.LOCKED) {
      throw appBadRequest('catalog.itemDeleteReferencedForbidden');
    }

    await this.catalogs.deleteItem(item.id);
    await this.audit.record({
      action: 'CATALOG_ITEM_DELETE',
      targetType: 'CATALOG_ITEM',
      targetId: item.id,
      before: { typeCode: item.typeCode, code: item.code, name: item.name, status: item.status },
    });
    return { deleted: true };
  }
}
