import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQuery } from '../../../../../common/http/pagination.query';
import { CatalogItemStatus } from '../../../domain/catalog-status.enum';

export class ListCatalogItemsRequest extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsEnum(CatalogItemStatus, { message: 'Trạng thái danh mục chỉ nhận ACTIVE hoặc LOCKED.' })
  status?: CatalogItemStatus;
}
