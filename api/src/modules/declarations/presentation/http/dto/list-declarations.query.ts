import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQuery } from '../../../../../common/http/pagination.query';
import {
  CheckpointCode,
  DeclarationStatus,
  DeclarationStatusGroup,
  DeclarationType,
  SRS_STATUS_ALIASES,
} from '../../../domain/declaration.enums';

/**
 * Tham số lọc của màn hình danh sách hồ sơ (UI-03).
 * ValidationPipe bật `forbidNonWhitelisted` nên mọi tham số phải khai ở đây, sai tên là 400.
 */
export class ListDeclarationsQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'Từ khóa tìm kiếm tối đa 120 ký tự.' })
  keyword?: string;

  @IsOptional()
  @IsEnum(DeclarationType, { message: 'Loại hình hồ sơ không hợp lệ.' })
  type?: DeclarationType;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && SRS_STATUS_ALIASES[value] ? SRS_STATUS_ALIASES[value] : value))
  @IsEnum(DeclarationStatus, { message: 'Trạng thái hồ sơ không hợp lệ.' })
  status?: DeclarationStatus;

  /**
   * Lọc theo **nhóm trạng thái** (mã đóng, vd `IN_PROGRESS`) → `status IN (...)`. Là đích của
   * drilldown KPI "Đang xử lý" nên số dòng danh sách khớp đúng con số trên thẻ. Mã lạ bị 400.
   */
  @IsOptional()
  @IsEnum(DeclarationStatusGroup, { message: 'Nhóm trạng thái hồ sơ không hợp lệ.' })
  statusGroup?: DeclarationStatusGroup;

  @IsOptional()
  @IsEnum(CheckpointCode, { message: 'Mã chốt không hợp lệ.' })
  checkpoint?: CheckpointCode;

  /** CR2 — chỉ lấy hồ sơ có cờ ưu tiên kiểm dịch (dịch tễ). Bỏ trống thì không lọc theo cờ. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean({ message: 'Tham số dịch tễ chỉ nhận true hoặc false.' })
  epidemic?: boolean;

  @IsOptional()
  @IsDateString({}, { message: 'Ngày bắt đầu không đúng định dạng.' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Ngày kết thúc không đúng định dạng.' })
  to?: string;

  /** Lọc theo một doanh nghiệp cụ thể — giữ lại từ P1 cho màn hình tra cứu nội bộ. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxCode?: string;
}
