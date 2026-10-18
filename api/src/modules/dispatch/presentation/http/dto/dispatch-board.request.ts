import { IsDateString, IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { CheckpointCode } from '../../../../declarations/domain/declaration.enums';

/** `forbidNonWhitelisted` đang bật nên mọi tham số lọc của UI-08 phải được khai đủ ở đây. */
export class DispatchBoardRequest {
  /**
   * Kept for older API consumers.  The dispatch screen now filters by the
   * dossier start-date range below instead of exposing a checkpoint selector.
   */
  @IsOptional()
  @IsEnum(CheckpointCode, { message: 'Mã chốt không hợp lệ.' })
  checkpoint?: CheckpointCode;

  /** Legacy single-day queue-ticket view. */
  @IsOptional()
  @IsISO8601({ strict: false }, { message: 'Tham số date phải theo định dạng YYYY-MM-DD.' })
  date?: string;

  /** Ngày bắt đầu, theo lịch Việt Nam (`YYYY-MM-DD`). */
  @IsOptional()
  @IsDateString({}, { message: 'Ngày bắt đầu không đúng định dạng.' })
  from?: string;

  /** Ngày kết thúc, theo lịch Việt Nam (`YYYY-MM-DD`). */
  @IsOptional()
  @IsDateString({}, { message: 'Ngày kết thúc không đúng định dạng.' })
  to?: string;

  /** Lọc theo mã hồ sơ hoặc biển số xe. */
  @IsOptional()
  @IsString({ message: 'Nội dung tìm kiếm phải là chuỗi.' })
  search?: string;
}
