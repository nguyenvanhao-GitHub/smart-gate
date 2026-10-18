import { Injectable } from '@nestjs/common';
import { PERMISSION_CATALOG, PermissionDefinition } from '../../domain/permission.catalog';

/**
 * Danh mục 60 mã quyền dựng ma trận UI-13. Trả thẳng từ catalog domain (không đọc DB) để giao diện
 * luôn có đủ 10 phân hệ × 6 hành động kể cả khi seed chưa chạy xong.
 */
@Injectable()
export class ListPermissionCatalogUseCase {
  execute(): PermissionDefinition[] {
    return PERMISSION_CATALOG;
  }
}
