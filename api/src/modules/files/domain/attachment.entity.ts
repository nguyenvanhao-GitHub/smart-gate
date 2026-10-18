import { randomUUID } from 'crypto';
import { AttachmentStatus } from './attachment-status.enum';

/**
 * Tệp đính kèm của hồ sơ (F11).
 *
 * `dossierId` **cho phép null** ở bước này: việc tách bảng hồ sơ (`Enterprise`/`Vehicle`/`CargoItem`…)
 * làm ở lượt sau, nên tệp có thể được tải lên trước khi hồ sơ tồn tại (màn khai báo theo bước UI-04).
 * Khi tệp chưa gắn hồ sơ thì chỉ chính người tải lên mới truy cập được — xem `AttachmentScopeService`.
 */
export class Attachment {
  constructor(
    public readonly id: string,
    public dossierId: string | null,
    /** Tên tệp gốc đã được làm sạch — chỉ để hiển thị, KHÔNG dùng làm đường dẫn lưu trữ. */
    public readonly originalName: string,
    /** MIME suy ra từ nội dung thật của tệp, không phải từ khai báo của client. */
    public readonly mimeType: string,
    public readonly sizeBytes: number,
    /** Khoá do server sinh trên kho lưu trữ. Không trả ra ngoài qua API. */
    public readonly storageKey: string,
    public readonly checksum: string,
    /** Mã trong danh mục `DOCUMENT_TYPE` của phân hệ `catalog`. */
    public readonly documentTypeCode: string | null,
    public readonly uploadedById: string,
    public readonly uploadedAt: Date,
    public status: AttachmentStatus,
    public deletedAt: Date | null,
    public deletedById: string | null,
  ) {}

  static create(input: {
    dossierId?: string | null;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    checksum: string;
    documentTypeCode?: string | null;
    uploadedById: string;
  }): Attachment {
    return new Attachment(
      randomUUID(),
      input.dossierId ?? null,
      input.originalName,
      input.mimeType,
      input.sizeBytes,
      input.storageKey,
      input.checksum,
      input.documentTypeCode ?? null,
      input.uploadedById,
      new Date(),
      AttachmentStatus.ACTIVE,
      null,
      null,
    );
  }

  get isDeleted(): boolean {
    return this.status === AttachmentStatus.DELETED;
  }

  /**
   * Xóa mềm: chỉ đổi trạng thái. Đối tượng trên kho lưu trữ được giữ nguyên để khôi phục được
   * chứng từ khi thao tác nhầm — việc dọn dẹp vật lý (nếu cần) thuộc quy trình vận hành riêng.
   */
  softDelete(actorId: string, at: Date = new Date()): void {
    if (this.isDeleted) return;
    this.status = AttachmentStatus.DELETED;
    this.deletedAt = at;
    this.deletedById = actorId;
  }
}
