import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { AppointmentStatus } from '../../domain/declaration.enums';
import {
  CargoItemInfo,
  EnterpriseInfo,
  TransshipmentVehicleInfo,
  VehicleInfo,
} from '../../domain/declaration.entity';
import { CopyDeclarationCommand } from '../dto/copy-declaration.command';
import { DossierDetail } from '../dto/dossier-view.dto';
import { DossierScopeService } from '../services/dossier-scope.service';
import { DOSSIER_ATTACHMENTS, DossierAttachmentPort } from '../ports/dossier-attachment.port';
import { DECLARATION_REPOSITORY, DeclarationRepository } from '../ports/declaration.repository';
import { CreateDeclarationUseCase } from './create-declaration.use-case';
import { appNotFound } from '../../../../common/i18n';

/**
 * CR3 — **Copy hồ sơ**. Dựng một hồ sơ **nháp** mới từ hồ sơ nguồn để người dùng sửa lại rồi gửi.
 *
 * Sao chép: doanh nghiệp, phương tiện (một xe kèm lái xe), phương tiện sang tải, dòng hàng, lịch hẹn
 * (**chỉ** thời điểm hẹn), loại hình và chốt làm thủ tục — **kèm tệp đính kèm** (nhân bản đối tượng
 * lưu trữ). Cố ý **không** chép: id, mã hồ sơ (sinh mã mới), chuỗi QR, mốc gửi, tiến trình/nhật ký và
 * trạng thái (đặt về nháp). Không mở phiên xử lý liên ngành.
 *
 * Việc tạo bản ghi mới **tái dùng** `CreateDeclarationUseCase` để không lặp lại logic sinh mã, khởi
 * tạo nháp và ghi nhật ký tạo hồ sơ.
 */
@Injectable()
export class CopyDeclarationUseCase {
  constructor(
    @Inject(DECLARATION_REPOSITORY)
    private readonly declarations: DeclarationRepository,
    @Inject(DOSSIER_ATTACHMENTS)
    private readonly attachments: DossierAttachmentPort,
    private readonly scope: DossierScopeService,
    private readonly createDeclaration: CreateDeclarationUseCase,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: CopyDeclarationCommand): Promise<DossierDetail> {
    const source = await this.declarations.findById(command.declarationId);
    if (!source) throw appNotFound('dossier.notFound');
    // Quyền `dossier.create` chỉ trả lời "có được tạo hồ sơ không"; hồ sơ **nguồn** thì phải hỏi tiếp
    // phạm vi dữ liệu, nếu không thì đoán id là sao chép được hồ sơ của doanh nghiệp khác.
    this.scope.assertAccessible(source, command.access);

    const created = await this.createDeclaration.execute({
      type: source.type,
      checkpoint: source.checkpoint,
      enterprise: this.cloneEnterprise(source.enterprise),
      vehicles: source.vehicles.map((vehicle) => this.cloneVehicle(vehicle)),
      cargoItems: source.cargoItems.map((item) => this.cloneCargoItem(item)),
      transshipmentVehicles: source.transshipmentVehicles.map((item) => this.cloneTransshipment(item)),
      // Lịch hẹn: chỉ giữ thời điểm hẹn; cửa/làn/khung giờ/mã phí đã bỏ ở đợt trước.
      appointment: source.appointment
        ? { scheduledAt: source.appointment.scheduledAt, status: AppointmentStatus.SCHEDULED }
        : undefined,
      actorId: command.actorId,
      actorRole: command.actorRole,
      skipConflictCheck: true,
      skipAudit: true,
    });

    // Nhân bản tệp đính kèm sang hồ sơ mới (kèm nội dung tệp). Trả về danh sách để đính vào chi tiết —
    // bản mới là nháp nên chưa có phiên/nhật ký, chỉ khác hồ sơ vừa tạo ở phần chứng từ.
    const attachments = await this.attachments.cloneToDossier(source.id, created.id, command.actorId);

    await this.audit.record({
      action: 'DECLARATION_COPY',
      targetType: 'DECLARATION',
      targetId: source.id,
      after: {
        sourceCode: source.code,
        copiedCode: created.code,
      },
    });

    return { ...created, attachments };
  }

  private cloneEnterprise(enterprise: EnterpriseInfo): EnterpriseInfo {
    // Bỏ `id` để hồ sơ mới không dính khoá bản ghi doanh nghiệp cũ; mã số thuế vẫn là khoá tự nhiên.
    return {
      taxCode: enterprise.taxCode,
      name: enterprise.name,
      representativeName: enterprise.representativeName,
      address: enterprise.address,
      phone: enterprise.phone,
      accountType: enterprise.accountType,
      idNumber: enterprise.idNumber,
      email: enterprise.email,
      jobTitle: enterprise.jobTitle,
      department: enterprise.department,
      createForOther: enterprise.createForOther,
    };
  }

  private cloneVehicle(vehicle: VehicleInfo): VehicleInfo {
    return {
      plateNumber: vehicle.plateNumber,
      containerNumber: vehicle.containerNumber,
      trailerNumber: vehicle.trailerNumber,
      transportLicenseNumber: vehicle.transportLicenseNumber,
      vehicleType: vehicle.vehicleType,
      weightKg: vehicle.weightKg,
      driver: vehicle.driver
        ? {
            fullName: vehicle.driver.fullName,
            idNumber: vehicle.driver.idNumber,
            idType: vehicle.driver.idType,
            phone: vehicle.driver.phone,
            licenseNumber: vehicle.driver.licenseNumber,
            nationality: vehicle.driver.nationality,
          }
        : vehicle.driver,
    };
  }

  private cloneCargoItem(item: CargoItemInfo): CargoItemInfo {
    return {
      description: item.description,
      cargoTypeCode: item.cargoTypeCode,
      quantity: item.quantity,
      unitCode: item.unitCode,
      grossWeightKg: item.grossWeightKg,
    };
  }

  private cloneTransshipment(item: TransshipmentVehicleInfo): TransshipmentVehicleInfo {
    return {
      sourcePlate: item.sourcePlate,
      plateNumber: item.plateNumber,
      vehicleType: item.vehicleType,
      containerNumber: item.containerNumber,
      trailerNumber: item.trailerNumber,
      driverName: item.driverName,
      fee01: item.fee01,
      transferPlace: item.transferPlace,
      note: item.note,
    };
  }
}
