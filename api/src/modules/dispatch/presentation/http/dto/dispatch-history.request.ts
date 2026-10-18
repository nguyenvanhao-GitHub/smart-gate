import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQuery } from '../../../../../common/http/pagination.query';

/** Bộ lọc màn "Lịch sử điều phối" (F33). `forbidNonWhitelisted` bật nên phải khai đủ tham số. */
export class DispatchHistoryRequest extends PaginationQuery {
  @IsOptional()
  @IsUUID('4', { message: 'Mã hồ sơ phải là UUID hợp lệ.' })
  dossierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  dossierCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  actor?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'Tham số from phải là ngày giờ định dạng ISO-8601.' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'Tham số to phải là ngày giờ định dạng ISO-8601.' })
  to?: string;
}
