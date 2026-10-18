import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { ListReasonCodesUseCase } from '../../application/use-cases/list-reason-codes.use-case';
import { ListReasonCodesRequest } from './dto/list-reason-codes.request';

/**
 * Đường dẫn `catalog/reason-codes` (số ít) là hợp đồng đã chốt với web ở P3; danh mục dùng chung
 * vẫn nằm ở `catalogs/...`. Mọi vai trò xử lý hồ sơ đều có `catalog.view` nên dùng đúng quyền đó.
 */
@ApiBearerAuth()
@ApiTags('Catalogs')
@Controller('catalog')
export class ReasonCodesController {
  constructor(private readonly listReasonCodes: ListReasonCodesUseCase) {}

  @RequirePermission('catalog.view', 'workflow.view', 'workflow.approve', 'dossier.view', 'dossier.update')
  @Get('reason-codes')
  list(@Query() query: ListReasonCodesRequest) {
    return this.listReasonCodes.execute(query.scope);
  }
}
