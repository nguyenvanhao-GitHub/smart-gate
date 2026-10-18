/**
 * Trạng thái tệp đính kèm. Xóa là **xóa mềm**: bản ghi và đối tượng trên kho lưu trữ đều được giữ
 * lại để không mất chứng từ vì thao tác nhầm (F11 + NFR-08).
 */
export enum AttachmentStatus {
  ACTIVE = 'ACTIVE',
  DELETED = 'DELETED',
}
