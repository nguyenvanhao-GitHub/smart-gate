import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from './pagination';

/**
 * Lớp cơ sở cho query string của endpoint danh sách. ValidationPipe bật `forbidNonWhitelisted`
 * nên mọi tham số lọc phải được khai báo tường minh ở DTO con.
 */
export class PaginationQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Tham số page phải là số nguyên.' })
  @Min(1, { message: 'Tham số page bắt đầu từ 1.' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Tham số pageSize phải là số nguyên.' })
  @Min(1, { message: 'Tham số pageSize phải lớn hơn 0.' })
  @Max(MAX_PAGE_SIZE, { message: `Tham số pageSize tối đa là ${MAX_PAGE_SIZE}.` })
  pageSize?: number;
}
