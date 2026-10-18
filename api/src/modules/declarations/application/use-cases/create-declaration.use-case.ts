import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { DossierDetail, toDossierDetail } from '../dto/dossier-view.dto';
import { Declaration } from '../../domain/declaration.entity';
import { CheckpointCode, DeclarationAction, DeclarationStatus } from '../../domain/declaration.enums';
import { CreateDeclarationCommand } from '../dto/create-declaration.command';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../ports/declaration.repository';
import { isPrivilegedRole } from '../../domain/privileged-roles.constant';
import { DossierAccountLinkerService } from '../services/dossier-account-linker.service';

/**
 * Tạo hồ sơ ở trạng thái **nháp** (`DRAFT`).
 *
 * Khác P1: trước đây hồ sơ vừa tạo đã là `SUBMITTED` ngay, doanh nghiệp không có bước lưu nháp.
 * Điều kiện nghiệm thu P2 yêu cầu tách hai bước tạo nháp → gửi, nên mã hồ sơ và QR chỉ có ý nghĩa
 * sau khi gửi (`SubmitDeclarationUseCase`).
 */
@Injectable()
export class CreateDeclarationUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
    private readonly linker?: DossierAccountLinkerService,
  ) {}

  async execute(command: CreateDeclarationCommand): Promise<DossierDetail> {
    const vehicles = command.vehicles ?? [];

    const now = new Date();
    const code = await this.declarations.nextCode(command.type);
    const cargoItems = command.cargoItems ?? [];

    let createdById = command.actorId;
    if (this.linker) {
      const isPrivilegedActor = isPrivilegedRole(command.actorRole);

      if (isPrivilegedActor) {
        const driverIdNumber = vehicles[0]?.driver?.idNumber;
        const matchedUserId = await this.linker.resolveAccountId({
          accountType: command.enterprise?.accountType,
          taxCode: command.enterprise?.taxCode,
          idNumber: command.enterprise?.idNumber || driverIdNumber,
          email: command.enterprise?.email,
          username: command.enterprise?.username,
        });
        if (matchedUserId) {
          createdById = matchedUserId;
        }
      }
    }

    const declaration = new Declaration(
      randomUUID(),
      code,
      command.type,
      DeclarationStatus.DRAFT,
      command.enterprise,
      // Phương tiện đơn (vị trí) chỉ là xe đầu tóm tắt; danh sách đầy đủ đặt qua `setVehicles` bên dưới.
      vehicles[0] ?? { plateNumber: '' },
      // Cột `cargo` (jsonb) được giữ song song cho tới khi nghiệm thu P2 — entity tự đồng bộ.
      { description: '' },
      command.checkpoint ?? CheckpointCode.SMART_GATE,
      {},
      [
        {
          id: randomUUID(),
          at: now,
          actorId: command.actorId,
          actorRole: command.actorRole,
          action: DeclarationAction.CREATE_DRAFT,
          note: 'Doanh nghiệp tạo hồ sơ nháp.',
          toStatus: DeclarationStatus.DRAFT,
        },
      ],
      now,
      now,
      command.feeDeclarationCode,
      createdById,
      { appointment: command.appointment ?? null },
    );
    declaration.setVehicles(vehicles);
    declaration.setCargoItems(cargoItems);
    declaration.setTransshipmentVehicles(command.transshipmentVehicles ?? []);
    declaration.updatedAt = now;

    const saved = await this.declarations.save(declaration);
    if (!command.skipAudit) {
      await this.audit.record({
        action: 'DECLARATION_CREATE',
        targetType: 'DECLARATION',
        targetId: saved.id,
        after: { code: saved.code, type: saved.type, status: saved.status, taxCode: saved.enterprise.taxCode },
      });
    }
    return toDossierDetail(saved);
  }
}
