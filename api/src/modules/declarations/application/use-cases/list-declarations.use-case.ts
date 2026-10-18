import { Inject, Injectable } from '@nestjs/common';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { PaginatedResult } from '../../../../common/http/pagination';
import { DossierSummary, toDossierSummary } from '../dto/dossier-view.dto';
import { DossierScopeService } from '../services/dossier-scope.service';
import {
  DECLARATION_REPOSITORY,
  DeclarationPageCriteria,
  DeclarationRepository,
} from '../ports/declaration.repository';

export interface ListDeclarationsCommand extends DeclarationPageCriteria {
  /** Quyền hiệu lực của người gọi, do PermissionsGuard nạp vào request. */
  access: UserAccessContext;
}

@Injectable()
export class ListDeclarationsUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    private readonly scope: DossierScopeService,
  ) {}

  async execute(command: ListDeclarationsCommand): Promise<PaginatedResult<DossierSummary>> {
    const { access, ...criteria } = command;
    const page = await this.declarations.findPage({ ...criteria, scope: this.scope.toCriteria(access) });
    return { ...page, items: page.items.map(toDossierSummary) };
  }
}
