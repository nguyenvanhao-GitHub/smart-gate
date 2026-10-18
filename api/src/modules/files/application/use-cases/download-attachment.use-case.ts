import { Inject, Injectable } from '@nestjs/common';
import { Readable } from 'stream';
import { AUDIT_LOGGER, AuditLogger, AuditResult } from '../../../../common/audit/audit-logger.port';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { Attachment } from '../../domain/attachment.entity';
import { ATTACHMENT_REPOSITORY, AttachmentRepository } from '../ports/attachment.repository';
import { STORAGE_PORT, StoragePort } from '../ports/storage.port';
import { AttachmentScopeService } from '../services/attachment-scope.service';
import { appNotFound, appUnavailable } from '../../../../common/i18n';

export interface DownloadAttachmentCommand {
  attachmentId: string;
  access: UserAccessContext;
}

export interface AttachmentDownload {
  attachment: Attachment;
  stream: Readable;
  contentLength?: number;
}

@Injectable()
export class DownloadAttachmentUseCase {
  constructor(
    @Inject(ATTACHMENT_REPOSITORY)
    private readonly attachments: AttachmentRepository,
    @Inject(STORAGE_PORT)
    private readonly storage: StoragePort,
    private readonly scope: AttachmentScopeService,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: DownloadAttachmentCommand): Promise<AttachmentDownload> {
    const attachment = await this.attachments.findById(command.attachmentId);
    if (!attachment) {
      await this.audit.record({
        action: 'ATTACHMENT_DOWNLOAD',
        targetType: 'ATTACHMENT',
        targetId: command.attachmentId,
        result: AuditResult.FAILURE,
        after: { reason: 'file.notFound' },
      });
      throw appNotFound('file.notFound');
    }

    try {
      // Kiểm phạm vi TRƯỚC mọi thông tin khác: người ngoài phạm vi không được biết tệp còn hay đã xóa.
      await this.scope.assertAccessible(attachment, command.access);

      if (attachment.isDeleted) {
        throw appNotFound('file.deleted');
      }

      if (!this.storage.isConfigured()) {
        throw appUnavailable('storage.notConfiguredDownload');
      }

      const stored = await this.storage.get(attachment.storageKey);

      await this.audit.record({
        action: 'ATTACHMENT_DOWNLOAD',
        targetType: 'ATTACHMENT',
        targetId: attachment.id,
        result: AuditResult.SUCCESS,
        after: {
          originalName: attachment.originalName,
          sizeBytes: attachment.sizeBytes,
          mimeType: attachment.mimeType,
          documentTypeCode: attachment.documentTypeCode,
          dossierId: attachment.dossierId,
        },
      });

      return { attachment, stream: stored.stream, contentLength: stored.contentLength };
    } catch (error) {
      await this.audit.record({
        action: 'ATTACHMENT_DOWNLOAD',
        targetType: 'ATTACHMENT',
        targetId: attachment.id,
        result: AuditResult.FAILURE,
        after: {
          originalName: attachment.originalName,
          dossierId: attachment.dossierId,
          reason: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  async logCancellation(command: DownloadAttachmentCommand): Promise<void> {
    const attachment = await this.attachments.findById(command.attachmentId);
    await this.audit.record({
      action: 'ATTACHMENT_DOWNLOAD',
      targetType: 'ATTACHMENT',
      targetId: command.attachmentId,
      result: AuditResult.FAILURE,
      after: {
        originalName: attachment?.originalName ?? 'Tệp đính kèm',
        dossierId: attachment?.dossierId,
        reason: 'Người dùng hủy/thoát thao tác tải file',
      },
    });
  }
}
