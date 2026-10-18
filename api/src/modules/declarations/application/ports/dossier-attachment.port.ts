export const DOSSIER_ATTACHMENTS = Symbol('DOSSIER_ATTACHMENTS');

/**
 * Chứng từ của hồ sơ, đúng theo hợp đồng dữ liệu đã thống nhất với web
 * (`fileName`/`contentType` chứ không phải `originalName`/`mimeType` của phân hệ `files`).
 */
export interface DossierAttachmentView {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  documentTypeCode: string | null;
  /** Tên loại chứng từ lấy từ danh mục `DOCUMENT_TYPE`; null khi mã không còn trong danh mục. */
  documentTypeName: string | null;
  uploadedAt: Date;
  /** Id tài khoản đã tải tệp lên. Hiển thị tên người dùng thuộc phân hệ `identity`, chưa ghép ở P2. */
  uploadedBy: string;
}

/**
 * Cổng đọc/gắn chứng từ của hồ sơ. Phân hệ `declarations` **không import** module `files`
 * (chiều phụ thuộc hiện tại là `files` → `declarations`, import ngược sẽ tạo vòng).
 */
export interface DossierAttachmentPort {
  listByDossier(dossierId: string): Promise<DossierAttachmentView[]>;
  /** Gắn các tệp đã tải lên vào hồ sơ. Ném lỗi khi tệp không tồn tại hoặc đã thuộc hồ sơ khác. */
  attach(dossierId: string, attachmentIds: string[]): Promise<DossierAttachmentView[]>;
  /** Gỡ tệp khỏi hồ sơ — chỉ bỏ liên kết, **không** xoá tệp trên kho lưu trữ. */
  detach(dossierId: string, attachmentId: string): Promise<void>;
  /**
   * Nhân bản mọi chứng từ đang hiệu lực của hồ sơ nguồn sang hồ sơ đích (CR3 — Copy hồ sơ).
   *
   * Cột `attachments.storage_key` có ràng buộc **DUY NHẤT** nên hai bản ghi **không thể** cùng trỏ
   * vào một đối tượng lưu trữ; adapter sao chép nội dung tệp sang một khoá mới rồi tạo bản ghi
   * attachment mới trỏ vào khoá đó. Trả danh sách chứng từ của hồ sơ đích sau khi nhân bản.
   */
  cloneToDossier(
    sourceDossierId: string,
    targetDossierId: string,
    actorId: string,
  ): Promise<DossierAttachmentView[]>;
}
