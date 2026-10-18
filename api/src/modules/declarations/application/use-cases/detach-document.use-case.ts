import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { DossierScopeService } from '../services/dossier-scope.service';
import { DOSSIER_ATTACHMENTS, DossierAttachmentPort } from '../ports/dossier-attachment.port';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../ports/declaration.repository';
import { appBadRequest, appNotFound } from '../../../../common/i18n';

/** Gỡ tệp khỏi hồ sơ — chỉ bỏ liên kết, tệp vẫn còn trên kho lưu trữ để khôi phục được. */
@Injectable()
export class DetachDocumentUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    @Inject(DOSSIER_ATTACHMENTS)
    private readonly attachments: DossierAttachmentPort,
    private readonly scope: DossierScopeService,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(declarationId: string, attachmentId: string, access: UserAccessContext): Promise<void> {
    const declaration = await this.declarations.findById(declarationId);
    if (!declaration) throw appNotFound('dossier.notFound');
    this.scope.assertAccessible(declaration, access);
    if (!declaration.isEditable) {
      throw appBadRequest('dossier.attachmentsLocked');
    }

    await this.attachments.detach(declaration.id, attachmentId);
    await this.audit.record({
      action: 'DECLARATION_DETACH_DOCUMENT',
      targetType: 'DECLARATION',
      targetId: declaration.id,
      after: {
        code: declaration.code,
        dossierCode: declaration.code,
        attachmentId,
      },
    });
  }
}
