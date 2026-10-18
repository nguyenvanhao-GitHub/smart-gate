import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { ListRequiredDocumentsUseCase } from '../../application/use-cases/list-required-documents.use-case';
import { ListRequiredDocumentsRequest } from './dto/list-required-documents.request';

/**
 * Chứng từ bắt buộc theo loại hồ sơ (F13). Đặt tại `/catalog/required-documents` vì là dữ liệu cấu
 * hình để web hiện checklist khi khai báo; quyền `dossier.view` — người khai hồ sơ có sẵn.
 */
@ApiBearerAuth()
@ApiTags('Catalogs')
@Controller('catalog/required-documents')
export class RequiredDocumentsController {
  constructor(private readonly listRequiredDocuments: ListRequiredDocumentsUseCase) {}

  @RequirePermission('dossier.view')
  @Get()
  list(@Query() query: ListRequiredDocumentsRequest) {
    return this.listRequiredDocuments.execute(query.dossierType);
  }
}
