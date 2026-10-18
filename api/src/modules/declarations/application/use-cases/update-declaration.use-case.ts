import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { Declaration } from '../../domain/declaration.entity';
import { DeclarationStatus } from '../../domain/declaration.enums';
import { DossierDetail, toDossierDetail } from '../dto/dossier-view.dto';
import { UpdateDeclarationCommand } from '../dto/update-declaration.command';
import { DossierScopeService } from '../services/dossier-scope.service';
import { DossierAccountLinkerService } from '../services/dossier-account-linker.service';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../ports/declaration.repository';
import { isPrivilegedRole } from '../../domain/privileged-roles.constant';
import { appBadRequest, appNotFound } from '../../../../common/i18n';

@Injectable()
export class UpdateDeclarationUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
    private readonly scope: DossierScopeService,
    private readonly linker?: DossierAccountLinkerService,
  ) {}

  async execute(command: UpdateDeclarationCommand): Promise<DossierDetail> {
    const declaration = await this.declarations.findById(command.declarationId);
    if (!declaration) throw appNotFound('dossier.notFound');
    this.scope.assertAccessible(declaration, command.access);

    // Khóa trường theo trạng thái (F15).
    if (!declaration.isEditable) {
      throw appBadRequest('dossier.lockedForEdit');
    }

    const before = {
      code: declaration.code,
      type: declaration.type,
      checkpoint: declaration.checkpoint,
      enterprise: { ...declaration.enterprise },
      vehicles: declaration.vehicles.map((vehicle) => ({ ...vehicle })),
      cargoItems: declaration.cargoItems.map((item) => ({ ...item })),
      transshipmentVehicles: declaration.transshipmentVehicles.map((item) => ({ ...item })),
      appointment: declaration.appointment ? { ...declaration.appointment } : null,
      feeDeclarationCode: declaration.feeDeclarationCode,
    };

    if (command.type !== undefined && command.type !== declaration.type) {
      declaration.type = command.type;
      if (declaration.status === DeclarationStatus.DRAFT) {
        declaration.code = await this.declarations.nextCode(command.type);
      }
    }
    if (command.checkpoint !== undefined) declaration.setCheckpoint(command.checkpoint);
    if (command.enterprise !== undefined) {
      const actorRoles = command.access?.roles?.map((r) => r.code) ?? [];
      const isPrivilegedActor = isPrivilegedRole(actorRoles);

      const targetAccountType =
        command.enterprise.accountType ?? declaration.enterprise?.accountType ?? 'ENTERPRISE';

      const isAccountTypeChanged =
        command.enterprise.accountType !== undefined &&
        command.enterprise.accountType !== declaration.enterprise?.accountType;

      const isTaxCodeChanged =
        targetAccountType === 'ENTERPRISE' &&
        command.enterprise.taxCode !== undefined &&
        command.enterprise.taxCode.trim() !== (declaration.enterprise?.taxCode || '').trim();

      const isIdNumberChanged =
        targetAccountType === 'INDIVIDUAL' &&
        command.enterprise.idNumber !== undefined &&
        command.enterprise.idNumber.trim() !== (declaration.enterprise?.idNumber || '').trim();

      const isEmailChanged =
        targetAccountType === 'INTERNAL' &&
        command.enterprise.email !== undefined &&
        command.enterprise.email.trim() !== (declaration.enterprise?.email || '').trim();

      const isIdentityChanged = isAccountTypeChanged || isTaxCodeChanged || isIdNumberChanged || isEmailChanged;

      const createForOther = isPrivilegedActor
        ? (command.enterprise.createForOther ?? declaration.enterprise?.createForOther)
        : declaration.enterprise?.createForOther;

      if (isIdentityChanged) {
        if (targetAccountType === 'INDIVIDUAL') {
          declaration.enterprise = {
            taxCode: '', // Xóa sạch taxCode để không rò rỉ vào enterpriseTaxCode của scope doanh nghiệp cũ
            idNumber: (command.enterprise.idNumber ?? '').trim(),
            name: command.enterprise.name ?? '',
            representativeName: undefined,
            address: command.enterprise.address,
            phone: command.enterprise.phone,
            email: command.enterprise.email,
            username: command.enterprise.username,
            jobTitle: undefined,
            department: undefined,
            accountType: 'INDIVIDUAL',
            createForOther,
          };
        } else if (targetAccountType === 'INTERNAL') {
          declaration.enterprise = {
            taxCode: (command.enterprise.taxCode ?? '').trim(),
            idNumber: undefined,
            name: command.enterprise.name ?? '',
            representativeName: undefined,
            address: command.enterprise.address,
            phone: command.enterprise.phone,
            email: command.enterprise.email,
            username: command.enterprise.username,
            jobTitle: command.enterprise.jobTitle,
            department: command.enterprise.department,
            accountType: 'INTERNAL',
            createForOther,
          };
        } else {
          // ENTERPRISE
          declaration.enterprise = {
            taxCode: (command.enterprise.taxCode ?? '').trim(),
            idNumber: undefined,
            name: command.enterprise.name ?? '',
            representativeName: command.enterprise.representativeName,
            address: command.enterprise.address,
            phone: command.enterprise.phone,
            email: command.enterprise.email,
            username: command.enterprise.username,
            jobTitle: undefined,
            department: undefined,
            accountType: 'ENTERPRISE',
            createForOther,
          };
        }
      } else {
        declaration.enterprise = {
          ...declaration.enterprise,
          ...command.enterprise,
          createForOther,
        };
      }

      if (this.linker && isPrivilegedActor && (isIdentityChanged || createForOther)) {
        const matchedUserId = await this.linker.resolveAccountId({
          accountType: declaration.enterprise.accountType,
          taxCode: declaration.enterprise.taxCode,
          idNumber: declaration.enterprise.idNumber,
          email: declaration.enterprise.email,
          username: declaration.enterprise.username,
        });
        if (matchedUserId) {
          declaration.createdById = matchedUserId;
        }
      }
    }
    if (command.vehicles !== undefined) {
      declaration.setVehicles(command.vehicles);
    }
    if (command.cargoItems !== undefined) declaration.setCargoItems(command.cargoItems);
    if (command.transshipmentVehicles !== undefined) {
      declaration.setTransshipmentVehicles(command.transshipmentVehicles);
    }
    if (command.appointment !== undefined) {
      declaration.appointment = command.appointment ? { ...declaration.appointment, ...command.appointment } : null;
    }
    if (command.feeDeclarationCode !== undefined) declaration.feeDeclarationCode = command.feeDeclarationCode;
    declaration.updatedAt = new Date();

    const saved = await this.save(declaration);
    await this.audit.record({
      action: 'DECLARATION_UPDATE',
      targetType: 'DECLARATION',
      targetId: saved.id,
      before,
      after: {
        code: saved.code,
        type: saved.type,
        checkpoint: saved.checkpoint,
        enterprise: { ...saved.enterprise },
        vehicles: saved.vehicles.map((vehicle) => ({ ...vehicle })),
        cargoItems: saved.cargoItems.map((item) => ({ ...item })),
        transshipmentVehicles: saved.transshipmentVehicles.map((item) => ({ ...item })),
        appointment: saved.appointment ? { ...saved.appointment } : null,
        feeDeclarationCode: saved.feeDeclarationCode,
      },
    });
    return toDossierDetail(saved);
  }

  private async save(declaration: Declaration): Promise<Declaration> {
    return this.declarations.save(declaration);
  }
}
