import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, AuditLogger } from '../../../../common/audit/audit-logger.port';
import { appBadRequest, appConflict, appNotFound } from '../../../../common/i18n';
import { toText } from '../../../../common/text/to-text';
import { CATALOG_REPOSITORY, CatalogRepository } from '../../../catalog/application/ports/catalog.repository';
import { BorderFacilityService } from '../../../catalog/application/services/border-facility.service';
import { YARD_ZONE_TYPE_CODE, buildSlotCodes } from '../../../catalog/domain/border-facility.catalog';
import { CatalogItemStatus } from '../../../catalog/domain/catalog-status.enum';
import { UpdateYardZoneCommand } from '../dto/update-yard-zone.command';
import { YardZoneView, occupiedByZoneCode, toYardZoneView } from '../dto/yard-zone-view.dto';
import { DISPATCH_ASSIGNMENT_REPOSITORY, DispatchAssignmentRepository } from '../ports/dispatch-assignment.repository';
import { YARD_REPOSITORY, YardRepository } from '../ports/yard.repository';

/**
 * Cập nhật tên và sức chứa của một khu bãi đỗ (F42).
 *
 * Ghi vào **metadata của mục danh mục `YARD_ZONE`** chứ không sửa thẳng bảng `yards` — bảng đó được
 * `YardProvisioningService.ensureLayout` dựng lại từ danh mục mỗi lần khởi động (điểm D8), sửa trực
 * tiếp sẽ bị ghi đè. Hợp nhất các khoá gửi vào, đồng bộ `slotCount` theo `capacity` mới và gọi `ensureLayout`
 * để cập nhật số ô đỗ. Mã khu là khoá nghiệp vụ nên không sửa. Ghi vết vào nhật ký kiểm toán.
 */
@Injectable()
export class UpdateYardZoneUseCase {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
    private readonly facilities: BorderFacilityService,
    @Inject(YARD_REPOSITORY)
    private readonly yards: YardRepository,
    @Inject(DISPATCH_ASSIGNMENT_REPOSITORY)
    private readonly assignments: DispatchAssignmentRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: UpdateYardZoneCommand): Promise<YardZoneView> {
    const item = await this.catalogs.findItemByCode(YARD_ZONE_TYPE_CODE, command.code);
    if (!item) throw appNotFound('yardZone.notFound');

    if (command.capacity !== undefined) {
      if (!Number.isInteger(command.capacity) || command.capacity < 0) {
        throw appBadRequest('yardZone.invalidCapacity');
      }

      const existingYard = await this.yards.findYardByCode(command.code);
      if (existingYard) {
        const currentCapacity =
          typeof item.metadata?.capacity === 'number'
            ? item.metadata.capacity
            : typeof item.metadata?.slotCount === 'number'
              ? item.metadata.slotCount
              : 0;

        if (command.capacity < currentCapacity) {
          const occupants = await this.assignments.findActiveByYard(existingYard.id);
          const occupiedCount = occupants.length;

          const targetSlotCodes = new Set(
            buildSlotCodes({
              code: command.code,
              name: command.name ?? item.name,
              capacity: command.capacity,
              slotPrefix: toText(item.metadata?.slotPrefix, command.code),
              slotCount: command.capacity,
              active: item.status === CatalogItemStatus.ACTIVE,
            }),
          );

          const occupantsInDeletedSlots = occupants.filter(
            (occ) => occ.assignment.slotCode && !targetSlotCodes.has(occ.assignment.slotCode),
          );

          if (occupantsInDeletedSlots.length > 0) {
            const slots = occupantsInDeletedSlots.map((occ) => occ.assignment.slotCode).join(', ');
            const details = occupantsInDeletedSlots
              .map((occ) => {
                const slot = occ.assignment.slotCode;
                const plate = occ.plateNumber ? `xe ${occ.plateNumber}` : 'xe chưa rõ biển số';
                return `ô ${slot} (${plate})`;
              })
              .join('; ');

            throw appConflict(
              'yardZone.cannotReduceSlotOccupied',
              {
                capacity: command.capacity,
                slots,
                details,
              },
              {
                occupiedSlots: occupantsInDeletedSlots.map((occ) => occ.assignment.slotCode),
                occupants: occupantsInDeletedSlots.map((occ) => ({
                  slotCode: occ.assignment.slotCode,
                  plateNumber: occ.plateNumber,
                  dossierCode: occ.dossierCode,
                })),
              },
            );
          }

          if (occupiedCount > command.capacity) {
            throw appConflict(
              'yardZone.cannotReduceCapacityBelowOccupied',
              {
                capacity: command.capacity,
                occupied: occupiedCount,
              },
              {
                occupiedCount,
                requestedCapacity: command.capacity,
              },
            );
          }
        }
      }
    }

    const before = { name: item.name, metadata: item.metadata };
    const metadata: Record<string, unknown> = { ...(item.metadata ?? {}) };
    if (command.capacity !== undefined) {
      metadata.capacity = command.capacity;
      metadata.slotCount = command.capacity;
    }

    item.update({ name: command.name, metadata });
    const saved = await this.catalogs.saveItem(item);

    await this.audit.record({
      action: 'YARD_ZONE_UPDATE',
      targetType: 'CATALOG_ITEM',
      targetId: saved.id,
      before,
      after: { name: saved.name, metadata: saved.metadata },
    });

    const [zones, yards, occupied] = await Promise.all([
      this.facilities.listYardZones(),
      this.yards.listYards(),
      this.assignments.countOccupiedByYard(),
    ]);

    await this.yards.ensureLayout(zones);

    const zone = zones.find((candidate) => candidate.code === saved.code);
    const used = occupiedByZoneCode(yards, occupied).get(saved.code) ?? 0;

    // `zone` luôn tồn tại vì vừa lưu; phòng hờ danh mục trả rỗng thì dựng view từ mục đã lưu.
    return zone
      ? toYardZoneView(zone, used)
      : toYardZoneView(
          {
            code: saved.code,
            name: saved.name,
            capacity: typeof metadata.capacity === 'number' ? metadata.capacity : 0,
            slotPrefix: saved.code,
            slotCount: typeof metadata.slotCount === 'number' ? metadata.slotCount : 0,
            active: true,
          },
          used,
        );
  }
}
