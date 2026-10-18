import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQuery } from '../../../../../common/http/pagination.query';
import { AUDIT_MODULE_CODES, AuditModuleCode } from '../../../domain/audit-module';

export class ListAuditLogsRequest extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  actor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  action?: string;

  /** Danh sách mã hành động (hoặc chuỗi phân tách dấu phẩy) để lọc nhiều hành động cùng lúc. */
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map((s: unknown) => String(s).trim()).filter(Boolean);
    if (typeof value === 'string') return value.split(',').map((s: string) => s.trim()).filter(Boolean);
    return undefined;
  })
  @IsArray()
  @IsString({ each: true })
  actions?: string[];

  /** Lọc theo phân hệ (F05) — suy ở máy chủ từ mã hành động/đối tượng (BUG-051). */
  @IsOptional()
  @IsIn(AUDIT_MODULE_CODES, { message: 'Phân hệ không hợp lệ.' })
  module?: AuditModuleCode;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  target?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'Tham số from phải là ngày giờ định dạng ISO-8601.' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'Tham số to phải là ngày giờ định dạng ISO-8601.' })
  to?: string;
}
