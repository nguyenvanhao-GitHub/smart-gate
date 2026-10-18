import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { ListOrganizationsUseCase } from '../../application/use-cases/list-organizations.use-case';

@ApiBearerAuth()
@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly listOrganizations: ListOrganizationsUseCase) {}

  /**
   * Ngoài màn quản trị (system.view), mọi vai trò đều cần cây đơn vị để dựng bộ lọc/dropdown,
   * nên chấp nhận thêm `catalog.view` — quyền mà mọi vai trò seed đều có.
   */
  @RequirePermission('system.view', 'catalog.view')
  @Get()
  list() {
    return this.listOrganizations.execute();
  }
}
