import { Attachment } from '../../domain/attachment.entity';
import { AttachmentOrmEntity } from './attachment.orm-entity';

export class AttachmentMapper {
  static toDomain(row: AttachmentOrmEntity): Attachment {
    return new Attachment(
      row.id,
      row.dossierId,
      row.originalName,
      row.mimeType,
      Number(row.sizeBytes),
      row.storageKey,
      row.checksum,
      row.documentTypeCode,
      row.uploadedById,
      row.uploadedAt,
      row.status,
      row.deletedAt,
      row.deletedById,
    );
  }

  static toPersistence(attachment: Attachment): AttachmentOrmEntity {
    const row = new AttachmentOrmEntity();
    row.id = attachment.id;
    row.dossierId = attachment.dossierId;
    row.originalName = attachment.originalName;
    row.mimeType = attachment.mimeType;
    row.sizeBytes = attachment.sizeBytes;
    row.storageKey = attachment.storageKey;
    row.checksum = attachment.checksum;
    row.documentTypeCode = attachment.documentTypeCode;
    row.uploadedById = attachment.uploadedById;
    row.uploadedAt = attachment.uploadedAt;
    row.status = attachment.status;
    row.deletedAt = attachment.deletedAt;
    row.deletedById = attachment.deletedById;
    return row;
  }
}
