import { Inject, Injectable, Optional } from '@nestjs/common';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { Declaration } from '../../domain/declaration.entity';
import {
  DossierValidationError,
  validateDossierCompleteness,
} from '../../domain/dossier-completeness.rules';
import { DossierScopeService } from '../services/dossier-scope.service';
import { DOSSIER_ATTACHMENTS, DossierAttachmentPort } from '../ports/dossier-attachment.port';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../ports/declaration.repository';
import {
  REQUIRED_DOCUMENT_CATALOG,
  RequiredDocumentCatalogPort,
} from '../ports/required-document.port';
import { appNotFound } from '../../../../common/i18n';
import { GetDossierFieldConfigsUseCase } from '../../../catalog/application/use-cases/get-dossier-field-configs.use-case';

export interface DossierValidationResult {
  valid: boolean;
  errors: DossierValidationError[];
}

/**
 * Xem trước kết quả kiểm tra tính đầy đủ (F13) — web gọi khi doanh nghiệp chuyển bước trong
 * biểu mẫu khai báo. Dùng **chung một bộ quy tắc** với `SubmitDeclarationUseCase` để không có
 * cảnh "web báo hợp lệ nhưng gửi lại bị chặn".
 */
@Injectable()
export class ValidateDeclarationUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    @Inject(DOSSIER_ATTACHMENTS)
    private readonly attachments: DossierAttachmentPort,
    @Inject(REQUIRED_DOCUMENT_CATALOG)
    private readonly requiredDocuments: RequiredDocumentCatalogPort,
    private readonly scope: DossierScopeService,
    @Optional()
    private readonly getFieldConfigs?: GetDossierFieldConfigsUseCase,
  ) {}

  async execute(id: string, access: UserAccessContext): Promise<DossierValidationResult> {
    const declaration = await this.declarations.findById(id);
    if (!declaration) throw appNotFound('dossier.notFound');
    this.scope.assertAccessible(declaration, access);

    const errors = await this.collectErrors(declaration);
    return { valid: errors.length === 0, errors };
  }

  /** Dùng lại ở use-case gửi hồ sơ — giữ một chỗ duy nhất tập hợp dữ liệu đầu vào cho quy tắc domain. */
  async collectErrors(declaration: Declaration): Promise<DossierValidationError[]> {
    const [attachments, requiredDocumentTypes, conflicts, fieldConfigs] = await Promise.all([
      this.attachments.listByDossier(declaration.id),
      this.requiredDocuments.listForDossierType(declaration.type),
      this.declarations.findActiveConflicts(
        (declaration.vehicles || []).map((v) => ({
          plateNumber: v.plateNumber,
          driverIdNumber: v.driver?.idNumber,
        })),
        declaration.id,
      ),
      this.getFieldConfigs ? this.getFieldConfigs.execute(declaration.type) : Promise.resolve([]),
    ]);

    const baseErrors = validateDossierCompleteness({
      declaration,
      fieldConfigs,
      requiredDocumentTypes,
      attachedDocumentTypeCodes: attachments
        .map((attachment) => attachment.documentTypeCode)
        .filter((code): code is string => !!code),
    });

    const conflictErrors: DossierValidationError[] = conflicts.map((c) => {
      const field =
        c.field === 'plateNumber'
          ? `vehicles[${c.vehicleIndex ?? 0}].plateNumber`
          : `vehicles[${c.vehicleIndex ?? 0}].driver.idNumber`;
      const message =
        c.field === 'plateNumber'
          ? `Biển số xe ${c.value} đang thuộc hồ sơ ${c.dossierCode} chưa kết thúc.`
          : `Số CCCD/Hộ chiếu ${c.value} của lái xe đang thuộc hồ sơ ${c.dossierCode} chưa kết thúc.`;
      return {
        field,
        message,
        messageKey: c.field === 'plateNumber' ? 'dossier.plateInUse' : 'dossier.driverIdInUse',
        messageParams: {
          plateNumber: c.value,
          idNumber: c.value,
          code: c.dossierCode,
        },
      };
    });

    return [...baseErrors, ...conflictErrors];
  }
}
