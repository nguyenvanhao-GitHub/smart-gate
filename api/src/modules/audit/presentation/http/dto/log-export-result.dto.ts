import { IsEnum, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuditResult } from '../../../../../common/audit/audit-logger.port';

export const ALLOWED_EXPORT_ACTIONS = ['REPORT_EXPORT'] as const;
export const ALLOWED_EXPORT_TARGET_TYPES = ['AUDIT_LOG', 'REPORT', 'FEE_WORKBENCH'] as const;

export class LogExportResultDto {
  @IsOptional()
  @IsIn(ALLOWED_EXPORT_ACTIONS, { message: 'Mã hành động xuất file không hợp lệ.' })
  action?: string;

  @IsOptional()
  @IsIn(ALLOWED_EXPORT_TARGET_TYPES, { message: 'Loại đối tượng xuất file không hợp lệ.' })
  targetType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  targetId?: string;

  @IsEnum(AuditResult, { message: 'Kết quả kiểm toán không hợp lệ.' })
  result!: AuditResult;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  reportName?: string;

  @IsOptional()
  @IsObject()
  filter?: Record<string, unknown>;
}
