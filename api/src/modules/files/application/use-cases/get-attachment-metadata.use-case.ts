import { Inject, Injectable } from '@nestjs/common';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { AttachmentView, toAttachmentView } from '../dto/attachment-view.dto';
import { ATTACHMENT_REPOSITORY, AttachmentRepository } from '../ports/attachment.repository';
import { DOCUMENT_TYPE_CATALOG, DocumentTypeCatalogPort } from '../ports/document-type-catalog.port';
import { AttachmentScopeService } from '../services/attachment-scope.service';
import { appNotFound } from '../../../../common/i18n';

@Injectable()
export class GetAttachmentMetadataUseCase {
  constructor(
    @Inject(ATTACHMENT_REPOSITORY)
    private readonly attachments: AttachmentRepository,
    @Inject(DOCUMENT_TYPE_CATALOG)
    private readonly documentTypes: DocumentTypeCatalogPort,
    private readonly scope: AttachmentScopeService,
  ) {}

  async execute(attachmentId: string, access: UserAccessContext): Promise<AttachmentView> {
    const attachment = await this.attachments.findById(attachmentId);
    if (!attachment) throw appNotFound('file.notFound');

    await this.scope.assertAccessible(attachment, access);
    const documentTypeName = attachment.documentTypeCode
      ? await this.documentTypes.nameOf(attachment.documentTypeCode)
      : null;
    return toAttachmentView(attachment, documentTypeName);
  }
}
