import { Inject, Injectable } from '@nestjs/common';
import {
  DECLARATION_REPOSITORY,
  DeclarationRepository,
} from '../../../declarations/application/ports/declaration.repository';
import { DossierOwnership, DossierOwnershipPort } from '../../application/ports/dossier-ownership.port';

/**
 * Hiện thực `DOSSIER_OWNERSHIP` trên bảng `declarations` hiện tại. Khi lượt tách bảng hồ sơ hoàn
 * tất, chỉ file này phải sửa — use-case và `AttachmentScopeService` giữ nguyên.
 */
@Injectable()
export class DeclarationDossierOwnershipAdapter implements DossierOwnershipPort {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
  ) {}

  async findOwnership(dossierId: string): Promise<DossierOwnership | null> {
    const declaration = await this.declarations.findById(dossierId);
    if (!declaration) return null;
    return {
      dossierId: declaration.id,
      createdById: declaration.createdById ?? null,
      taxCode: declaration.enterprise?.taxCode ?? null,
    };
  }
}
