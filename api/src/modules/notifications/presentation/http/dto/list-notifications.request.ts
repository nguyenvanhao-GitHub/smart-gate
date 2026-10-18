import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQuery } from '../../../../../common/http/pagination.query';

export class ListNotificationsRequest extends PaginationQuery {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean({ message: 'Tham số unreadOnly chỉ nhận true hoặc false.' })
  unreadOnly?: boolean;
}
