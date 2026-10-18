import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { DossierScopeService } from '../services/dossier-scope.service';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../ports/declaration.repository';
import { appNotFound } from '../../../../common/i18n';

@Injectable()
export class DeleteDeclarationUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    private readonly scope: DossierScopeService,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(id: string, access?: UserAccessContext): Promise<{ deleted: true }> {
    const declaration = await this.declarations.findById(id);
    if (!declaration) throw appNotFound('dossier.notFound');
    if (access) {
      this.scope.assertAccessible(declaration, access);
    }

    await this.declarations.delete(id);
    await this.audit.record({
      action: 'DECLARATION_DELETE',
      targetType: 'DECLARATION',
      targetId: id,
      before: {
        code: declaration.code,
        type: declaration.type,
        status: declaration.status,
        taxCode: declaration.enterprise.taxCode,
      },
    });
    return { deleted: true };
  }
}

