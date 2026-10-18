import { IsDateString, IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { CheckpointCode } from '../../../../declarations/domain/declaration.enums';

export class CallNextDispatchRequest {
  @IsOptional()
  @IsEnum(CheckpointCode, { message: 'Mã chốt không hợp lệ.' })
  checkpoint?: CheckpointCode;

  @IsOptional()
  @IsISO8601({ strict: false }, { message: 'Tham số date phải theo định dạng YYYY-MM-DD.' })
  date?: string;

  /** Giữ thao tác gọi số trong đúng tập dữ liệu người dùng đang xem trên bảng điều phối. */
  @IsOptional()
  @IsDateString({}, { message: 'Ngày bắt đầu không đúng định dạng.' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Ngày kết thúc không đúng định dạng.' })
  to?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Mã hồ sơ không hợp lệ.' })
  dossierId?: string;
}
