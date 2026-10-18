import { Attachment } from '../../domain/attachment.entity';

export const ATTACHMENT_REPOSITORY = Symbol('ATTACHMENT_REPOSITORY');

export interface AttachmentRepository {
  save(attachment: Attachment): Promise<Attachment>;
  findById(id: string): Promise<Attachment | null>;
  /** Tệp còn hiệu lực của một hồ sơ — phục vụ tab "Chứng từ" của UI-05 ở lượt tách bảng hồ sơ. */
  findByDossier(dossierId: string): Promise<Attachment[]>;
}
