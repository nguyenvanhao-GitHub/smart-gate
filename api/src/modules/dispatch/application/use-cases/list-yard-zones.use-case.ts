import { Inject, Injectable } from '@nestjs/common';
import { BorderFacilityService } from '../../../catalog/application/services/border-facility.service';
import { YardZoneView, occupiedByZoneCode, toYardZoneView } from '../dto/yard-zone-view.dto';
import { DISPATCH_ASSIGNMENT_REPOSITORY, DispatchAssignmentRepository } from '../ports/dispatch-assignment.repository';
import { YARD_REPOSITORY, YardRepository } from '../ports/yard.repository';

/**
 * Liệt kê khu bãi đỗ kèm sức chứa công bố và số ô đang có xe (F42, UI-11).
 *
 * Cấu hình khu (tên/sức chứa/số ô/trạng thái) đọc từ danh mục `YARD_ZONE` — nguồn sự thật (điểm D8);
 * số ô đang dùng đọc từ bảng vị trí điều phối để màn cấu hình biết khu nào còn chỗ.
 */
@Injectable()
export class ListYardZonesUseCase {
  constructor(
    private readonly facilities: BorderFacilityService,
    @Inject(YARD_REPOSITORY)
    private readonly yards: YardRepository,
    @Inject(DISPATCH_ASSIGNMENT_REPOSITORY)
    private readonly assignments: DispatchAssignmentRepository,
  ) {}

  async execute(): Promise<YardZoneView[]> {
    const [zones, yards, occupied] = await Promise.all([
      this.facilities.listYardZones(),
      this.yards.listYards(),
      this.assignments.countOccupiedByYard(),
    ]);

    const usedByCode = occupiedByZoneCode(yards, occupied);
    return zones.map((zone) => toYardZoneView(zone, usedByCode.get(zone.code) ?? 0));
  }
}
