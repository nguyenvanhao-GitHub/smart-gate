import { Attachment } from '../../domain/attachment.entity';

/**
 * Dữ liệu tệp trả ra ngoài. Shape **khớp `DossierAttachment` của web** (`fileName`/`contentType`
 * chứ không phải `originalName`/`mimeType`) để phản hồi upload/metadata dùng chung một hợp đồng với
 * đường tải-lại hồ sơ — nếu lệch, FE mất tên tệp gốc ngay sau khi đính kèm.
 *
 * **Cố tình không có `storageKey`** — khoá lưu trữ là đường dẫn nội bộ của kho lưu trữ, lộ ra ngoài
 * là mở đường dò quét đối tượng của hồ sơ khác.
 */
export interface AttachmentView {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  documentTypeCode: string | null;
  /** Tên loại chứng từ lấy từ danh mục `DOCUMENT_TYPE`; null khi mã không còn trong danh mục. */
  documentTypeName: string | null;
  uploadedAt: Date;
  uploadedBy: string;
}

export function toAttachmentView(attachment: Attachment, documentTypeName: string | null): AttachmentView {
  return {
    id: attachment.id,
    fileName: attachment.originalName,
    contentType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    documentTypeCode: attachment.documentTypeCode,
    documentTypeName,
    uploadedAt: attachment.uploadedAt,
    uploadedBy: attachment.uploadedById,
  };
}
