import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { BorderFacilityService } from '../../application/services/border-facility.service';

/**
 * Cấu hình vật lý cửa khẩu cho các màn hình điều phối/cổng/kho bãi (điểm **D8**).
 *
 * Tách khỏi `CatalogsController` (`/catalogs`) vì đây là **dữ liệu đã diễn giải** (đã bung
 * `metadata` thành trường tường minh), không phải danh mục thô. Việc thêm/sửa/khoá vẫn dùng
 * đường `/catalogs/BORDER_GATE/items` sẵn có.
 */
@ApiBearerAuth()
@ApiTags('Catalogs')
@Controller('catalog')
export class BorderFacilityController {
  constructor(private readonly facilities: BorderFacilityService) {}

  @RequirePermission('catalog.view', 'dispatch.view', 'gate.view', 'yard.view')
  @Get('gates')
  gates() {
    return this.facilities.listGates();
  }

  @RequirePermission('catalog.view', 'dispatch.view', 'gate.view', 'yard.view')
  @Get('lanes')
  lanes() {
    return this.facilities.listLanes();
  }
}
