import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { ListYardZonesUseCase } from '../../application/use-cases/list-yard-zones.use-case';
import { UpdateYardZoneUseCase } from '../../application/use-cases/update-yard-zone.use-case';
import { UpdateYardZoneRequest } from './dto/update-yard-zone.request';

/**
 * Cấu hình bãi và sức chứa (F42 — UI-11). Đặt tại `/catalog/yard-zones` vì khu bãi là **danh mục**
 * (`YARD_ZONE`, điểm D8) — bảng `yards`/`parking_slots` được dựng lại từ đây lúc khởi động. Sửa cấu
 * hình là việc quản trị nên PATCH đòi quyền `catalog.update`; đọc mở cho các lực lượng kho bãi/điều phối.
 */
@ApiBearerAuth()
@ApiTags('Catalogs')
@Controller('catalog/yard-zones')
export class YardZonesController {
  constructor(
    private readonly listYardZones: ListYardZonesUseCase,
    private readonly updateYardZone: UpdateYardZoneUseCase,
  ) {}

  @RequirePermission('catalog.view', 'yard.view', 'dispatch.view')
  @Get()
  list() {
    return this.listYardZones.execute();
  }

  /** Cập nhật tên và sức chứa của một khu bãi (F42). */
  @RequirePermission('yard.approve', 'catalog.update')
  @Patch(':code')
  update(@Param('code') code: string, @Body() body: UpdateYardZoneRequest) {
    return this.updateYardZone.execute({ code, name: body.name, capacity: body.capacity });
  }
}
