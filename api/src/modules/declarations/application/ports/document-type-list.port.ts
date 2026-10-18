export const DOCUMENT_TYPE_LIST_CATALOG = Symbol('DOCUMENT_TYPE_LIST_CATALOG');

/** Mã nhóm danh mục loại chứng từ (trùng `DOCUMENT_TYPE_CATALOG_CODE` của phân hệ `files`). */
export const DOCUMENT_TYPE_LIST_CATALOG_CODE = 'DOCUMENT_TYPE';

/** Một loại chứng từ đọc từ danh mục dùng chung để web đổ vào ô chọn khi đính kèm tệp (F04/F11). */
export interface DocumentTypeOption {
  code: string;
  name: string;
}

/**
 * Cổng liệt kê loại chứng từ **đang dùng được** (ACTIVE) của danh mục `DOCUMENT_TYPE`.
 *
 * Đây là nguồn sự thật để web dựng danh sách "Loại chứng từ" thay cho danh sách cứng ở FE — nhờ đó
 * mã web gửi lên khi upload luôn nằm trong danh mục và không bị `UploadAttachmentUseCase` từ chối.
 * Danh mục trống thì trả mảng rỗng.
 */
export interface DocumentTypeListCatalogPort {
  listUsable(): Promise<DocumentTypeOption[]>;
}
