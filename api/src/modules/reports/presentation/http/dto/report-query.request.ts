import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from '../../../../../common/http/pagination';
import { CheckpointCode, DeclarationStatus, DeclarationType } from '../../../../declarations/domain/declaration.enums';

/** Ô lọc chưa chọn thường được giao diện gửi lên dạng chuỗi rỗng — coi như không lọc, không phải 400. */
const emptyToUndefined = Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));

/**
 * Bộ lọc gửi lên khi chạy hoặc xuất báo cáo.
 * `ValidationPipe` bật `forbidNonWhitelisted` nên tham số lạ là 400 — thêm bộ lọc mới phải khai ở đây
 * **và** thêm vào `filters` của báo cáo trong `report.catalog.ts`.
 */
export class ReportQueryRequest {
  @IsOptional()
  @IsDateString({}, { message: 'Ngày bắt đầu không đúng định dạng.' })
  @emptyToUndefined
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Ngày kết thúc không đúng định dạng.' })
  @emptyToUndefined
  to?: string;

  @IsOptional()
  @IsEnum(CheckpointCode, { message: 'Mã chốt không hợp lệ.' })
  @emptyToUndefined
  checkpoint?: CheckpointCode;

  @IsOptional()
  @IsEnum(DeclarationType, { message: 'Loại hình hồ sơ không hợp lệ.' })
  @emptyToUndefined
  type?: DeclarationType;

  @IsOptional()
  @IsEnum(DeclarationStatus, { message: 'Trạng thái hồ sơ không hợp lệ.' })
  @emptyToUndefined
  status?: DeclarationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã lực lượng tối đa 32 ký tự.' })
  @emptyToUndefined
  agencyCode?: string;

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
