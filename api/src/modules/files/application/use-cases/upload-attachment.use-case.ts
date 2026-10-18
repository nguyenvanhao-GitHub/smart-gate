import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { AttachmentStatus } from '../../domain/attachment-status.enum';
import {
  ALLOWED_FILE_TYPE_LABELS,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENT_SIZE_MB,
  buildStorageKey,
  checksumOf,
  detectAttachmentFileType,
  fileExtension,
  sanitizeOriginalFileName,
} from '../../domain/attachment-file.rules';
import { Attachment } from '../../domain/attachment.entity';
import { AttachmentView, toAttachmentView } from '../dto/attachment-view.dto';
import { UploadAttachmentCommand } from '../dto/upload-attachment.command';
import { ATTACHMENT_REPOSITORY, AttachmentRepository } from '../ports/attachment.repository';
import { DOCUMENT_TYPE_CATALOG, DocumentTypeCatalogPort } from '../ports/document-type-catalog.port';
import { STORAGE_PORT, StoragePort } from '../ports/storage.port';
import { appBadRequest, appUnavailable } from '../../../../common/i18n';

@Injectable()
export class UploadAttachmentUseCase {
  private readonly logger = new Logger(UploadAttachmentUseCase.name);

  constructor(
    @Inject(ATTACHMENT_REPOSITORY)
    private readonly attachments: AttachmentRepository,
    @Inject(STORAGE_PORT)
    private readonly storage: StoragePort,
    @Inject(DOCUMENT_TYPE_CATALOG)
    private readonly documentTypes: DocumentTypeCatalogPort,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: UploadAttachmentCommand): Promise<AttachmentView> {
    if (!this.storage.isConfigured()) {
      throw appUnavailable('storage.notConfiguredUpload');
    }

    const content = command.content;
    if (!content || content.length === 0) {
      throw appBadRequest('file.emptyContent');
    }
    // Tầng HTTP đã chặn một lần; kiểm lại ở đây để quy tắc dung lượng nằm trong nghiệp vụ, không
    // phụ thuộc cấu hình middleware.
    if (content.length > MAX_ATTACHMENT_SIZE_BYTES) {
      throw appBadRequest('file.tooLarge', { max: MAX_ATTACHMENT_SIZE_MB });
    }

    const originalName = sanitizeOriginalFileName(command.fileName);
    const detected = detectAttachmentFileType(content, originalName);
    if (!detected) {
      throw appBadRequest('file.typeNotAllowed', { allowed: ALLOWED_FILE_TYPE_LABELS });
    }

    // Nội dung thật đã quyết định kiểu tệp; nếu phần mở rộng nói khác thì đây là dấu hiệu ngụy trang.
    const extension = fileExtension(originalName);
    if (extension && !detected.allowedExtensions.includes(extension)) {
      throw appBadRequest('file.extensionMismatch', { extension, detected: detected.label });
    }

    if (command.documentTypeCode && !(await this.documentTypes.isUsable(command.documentTypeCode))) {
      throw appBadRequest('file.documentTypeInvalid');
    }

    const storageKey = buildStorageKey(detected.extension);
    const checksum = checksumOf(content);

    await this.storage.put({
      key: storageKey,
      content,
      contentType: detected.mimeType,
      checksum,
    });

    let attachment: Attachment;
    try {
      attachment = await this.attachments.save(
        Attachment.create({
          dossierId: command.dossierId ?? null,
          originalName,
          mimeType: detected.mimeType,
          sizeBytes: content.length,
          storageKey,
          checksum,
          documentTypeCode: command.documentTypeCode ?? null,
          uploadedById: command.actorId,
        }),
      );
    } catch (error) {
      // Ghi DB hỏng sau khi đã đẩy tệp lên kho: dọn đối tượng mồ côi rồi mới ném lỗi ra ngoài.
      await this.storage.remove(storageKey).catch((cleanupError: Error) => {
        this.logger.warn(`Không dọn được tệp mồ côi ${storageKey}: ${cleanupError.message}`);
      });
      throw error;
    }

    await this.audit.record({
      action: 'ATTACHMENT_UPLOAD',
      targetType: 'ATTACHMENT',
      targetId: attachment.id,
      after: {
        dossierId: attachment.dossierId,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        checksum: attachment.checksum,
        documentTypeCode: attachment.documentTypeCode,
        status: AttachmentStatus.ACTIVE,
      },
    });

    const documentTypeName = attachment.documentTypeCode
      ? await this.documentTypes.nameOf(attachment.documentTypeCode)
      : null;
    return toAttachmentView(attachment, documentTypeName);
  }
}
