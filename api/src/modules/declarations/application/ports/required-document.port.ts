import { RequiredDocumentType } from '../../domain/dossier-completeness.rules';
import { DeclarationType } from '../../domain/declaration.enums';

export const REQUIRED_DOCUMENT_CATALOG = Symbol('REQUIRED_DOCUMENT_CATALOG');

/** Mã nhóm danh mục khai chứng từ bắt buộc theo loại hồ sơ (xem `catalog.seed.ts`). */
export const REQUIRED_DOCUMENT_CATALOG_CODE = 'REQUIRED_DOCUMENT';

/**
 * Cổng đọc **cấu hình** chứng từ bắt buộc theo loại hồ sơ (F13).
 *
 * ⚠️ Điểm **D7** của kế hoạch chưa được chốt: chưa ai đưa được danh sách chứng từ bắt buộc cho
 * từng loại hồ sơ. Vì vậy cơ chế được dựng sẵn nhưng **danh mục để trống** — hiện thực phải trả
 * mảng rỗng khi chưa cấu hình, và khi rỗng thì `validateDossierCompleteness` không chặn gửi hồ sơ
 * vì lý do chứng từ. Khi BA chốt D7 thì chỉ cần khai qua màn hình Danh mục, không phải sửa mã nguồn.
 */
export interface RequiredDocumentCatalogPort {
  listForDossierType(type: DeclarationType): Promise<RequiredDocumentType[]>;
}
