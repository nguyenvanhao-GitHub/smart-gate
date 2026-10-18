import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { AttachmentStatus } from '../../domain/attachment-status.enum';
import { Attachment } from '../../domain/attachment.entity';
import { AttachmentView, toAttachmentView } from '../dto/attachment-view.dto';
import { ATTACHMENT_REPOSITORY, AttachmentRepository } from '../ports/attachment.repository';
import { DOCUMENT_TYPE_CATALOG, DocumentTypeCatalogPort } from '../ports/document-type-catalog.port';
import { AttachmentScopeService } from '../services/attachment-scope.service';
import { appNotFound } from '../../../../common/i18n';

@Injectable()
export class DeleteAttachmentUseCase {
  constructor(
    @Inject(ATTACHMENT_REPOSITORY)
    private readonly attachments: AttachmentRepository,
    @Inject(DOCUMENT_TYPE_CATALOG)
    private readonly documentTypes: DocumentTypeCatalogPort,
    private readonly scope: AttachmentScopeService,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  /** Xóa mềm — tệp trên kho lưu trữ được giữ lại để không mất chứng từ vì thao tác nhầm. */
  async execute(attachmentId: string, access: UserAccessContext): Promise<AttachmentView> {
    const attachment = await this.attachments.findById(attachmentId);
    if (!attachment) throw appNotFound('file.notFound');

    await this.scope.assertAccessible(attachment, access);
    if (attachment.isDeleted) return this.toView(attachment);

    attachment.softDelete(access.userId);
    const saved = await this.attachments.save(attachment);

    await this.audit.record({
      action: 'ATTACHMENT_DELETE',
      targetType: 'ATTACHMENT',
      targetId: saved.id,
      before: { status: AttachmentStatus.ACTIVE },
      after: {
        status: saved.status,
        dossierId: saved.dossierId,
        originalName: saved.originalName,
        deletedAt: saved.deletedAt,
        deletedById: saved.deletedById,
      },
    });

    return this.toView(saved);
  }

  private async toView(attachment: Attachment): Promise<AttachmentView> {
    const documentTypeName = attachment.documentTypeCode
      ? await this.documentTypes.nameOf(attachment.documentTypeCode)
      : null;
    return toAttachmentView(attachment, documentTypeName);
  }
}
