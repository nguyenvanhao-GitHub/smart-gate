import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { ListDocumentTypesUseCase } from '../../application/use-cases/list-document-types.use-case';

/**
 * Danh mục loại chứng từ (F04) để web đổ vào ô chọn khi đính kèm tệp. Đặt tại
 * `/catalog/document-types` với quyền `dossier.view` — người khai hồ sơ có sẵn quyền này.
 */
@ApiBearerAuth()
@ApiTags('Catalogs')
@Controller('catalog/document-types')
export class DocumentTypesController {
  constructor(private readonly listDocumentTypes: ListDocumentTypesUseCase) {}

  @RequirePermission('dossier.view')
  @Get()
  list() {
    return this.listDocumentTypes.execute();
  }
}
