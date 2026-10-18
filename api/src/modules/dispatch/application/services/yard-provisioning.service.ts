import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { BorderFacilityService } from '../../../catalog/application/services/border-facility.service';
import { YARD_REPOSITORY, YardRepository } from '../ports/yard.repository';

/**
 * Dựng bảng `yards` / `parking_slots` theo danh mục `YARD_ZONE` (điểm **D8**) lúc khởi động.
 *
 * Danh mục là nguồn sự thật: đổi sức chứa hay thêm khu/ô trên màn hình Danh mục rồi khởi động
 * lại là có hiệu lực, **không phải sửa mã nguồn**. Ô đỗ chỉ được thêm, không bị xoá — ô có thể
 * đang có xe đứng.
 *
 * `DispatchModule` import `CatalogModule` nên `CatalogSeedService` đã chạy xong trước bước này.
 */
@Injectable()
export class YardProvisioningService implements OnApplicationBootstrap {
  private readonly logger = new Logger(YardProvisioningService.name);

  constructor(
    private readonly facilities: BorderFacilityService,
    @Inject(YARD_REPOSITORY)
    private readonly yards: YardRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const zones = await this.facilities.listYardZones();
    if (zones.length === 0) {
      this.logger.warn('Danh mục "Khu bãi đỗ" chưa có dữ liệu — chưa dựng được khu bãi nào.');
      return;
    }

    await this.yards.ensureLayout(zones);
    const slots = zones.reduce((total, zone) => total + zone.slotCount, 0);
    this.logger.log(`Đã đồng bộ ${zones.length} khu bãi / ${slots} ô đỗ theo danh mục (số liệu tạm, điểm D8).`);
  }
}
