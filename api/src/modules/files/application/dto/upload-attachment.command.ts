/** Lệnh tải tệp lên. `content` là nội dung thật của tệp, đã nằm trong bộ nhớ (không ghi ổ đĩa). */
export interface UploadAttachmentCommand {
  /** Tên tệp thô do client gửi — use-case tự làm sạch, không tin trực tiếp. */
  fileName?: string;
  content: Buffer;
  dossierId?: string;
  documentTypeCode?: string;
  actorId: string;
}
