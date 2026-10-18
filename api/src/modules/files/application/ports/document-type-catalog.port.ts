export const DOCUMENT_TYPE_CATALOG = Symbol('DOCUMENT_TYPE_CATALOG');

/** Mã nhóm danh mục chứa loại chứng từ (xem `catalog.seed.ts`). */
export const DOCUMENT_TYPE_CATALOG_CODE = 'DOCUMENT_TYPE';

/**
 * Cổng kiểm tra mã loại chứng từ có trong danh mục dùng chung hay không (F04).
 * Danh sách chứng từ **bắt buộc** theo từng loại hồ sơ vẫn đang chờ chốt điểm D7 của kế hoạch,
 * nên ở bước này mã loại chứng từ là tùy chọn, chỉ kiểm tính hợp lệ khi người dùng có khai.
 */
export interface DocumentTypeCatalogPort {
  isUsable(code: string): Promise<boolean>;
  /** Tên loại chứng từ tra từ danh mục; null khi mã rỗng hoặc không còn trong danh mục. */
  nameOf(code: string): Promise<string | null>;
}
