import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { AttachDocumentsCommand } from '../dto/submit-declaration.command';
import { DossierScopeService } from '../services/dossier-scope.service';
import {
  DOSSIER_ATTACHMENTS,
  DossierAttachmentPort,
  DossierAttachmentView,
} from '../ports/dossier-attachment.port';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../ports/declaration.repository';
import { appBadRequest, appNotFound } from '../../../../common/i18n';

/**
 * Gắn tệp đã tải lên (`POST /files`) vào hồ sơ. Tách làm hai bước là cố ý: màn khai báo theo bước
 * UI-04 cho phép doanh nghiệp tải chứng từ trước khi hồ sơ nháp được lưu.
 */
@Injectable()
export class AttachDocumentsUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    @Inject(DOSSIER_ATTACHMENTS)
    private readonly attachments: DossierAttachmentPort,
    private readonly scope: DossierScopeService,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: AttachDocumentsCommand): Promise<DossierAttachmentView[]> {
    const declaration = await this.declarations.findById(command.declarationId);
    if (!declaration) throw appNotFound('dossier.notFound');
    this.scope.assertAccessible(declaration, command.access);
    if (!declaration.isEditable) {
      throw appBadRequest('dossier.attachmentsLocked');
    }

    const attachmentIds = [...new Set(command.attachmentIds)];
    if (attachmentIds.length === 0) {
      throw appBadRequest('dossier.noAttachmentSelected');
    }

    const result = await this.attachments.attach(declaration.id, attachmentIds);
    await this.audit.record({
      action: 'DECLARATION_ATTACH_DOCUMENTS',
      targetType: 'DECLARATION',
      targetId: declaration.id,
      after: {
        code: declaration.code,
        dossierCode: declaration.code,
        attachmentIds,
      },
    });
    return result;
  }
}
