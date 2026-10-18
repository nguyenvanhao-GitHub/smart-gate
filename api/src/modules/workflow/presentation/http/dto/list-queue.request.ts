import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQuery } from '../../../../../common/http/pagination.query';
import { CheckpointCode, DeclarationStatus, DeclarationType } from '../../../../declarations/domain/declaration.enums';
import { QueueTab } from '../../../domain/workflow.enums';

/** `forbidNonWhitelisted` đang bật nên mọi tham số lọc của UI-06 phải được khai đủ ở đây. */
export class ListQueueRequest extends PaginationQuery {
  @IsOptional()
  @IsEnum(QueueTab, { message: 'Tham số tab chỉ nhận todo, done hoặc waiting.' })
  tab?: QueueTab;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Từ khóa tìm kiếm tối đa 100 ký tự.' })
  keyword?: string;

  @IsOptional()
  @IsEnum(DeclarationType, { message: 'Loại hồ sơ không hợp lệ.' })
  type?: DeclarationType;

  @IsOptional()
  @IsEnum(DeclarationStatus, { message: 'Trạng thái hồ sơ không hợp lệ.' })
  status?: DeclarationStatus;

  @IsOptional()
  @IsEnum(CheckpointCode, { message: 'Mã chốt không hợp lệ.' })
  checkpoint?: CheckpointCode;

  /** Lọc theo ngày hồ sơ vào hàng đợi (F20) — biên dưới, tính theo ngày giờ VN ở tầng dữ liệu. */
  @IsOptional()
  @IsDateString({}, { message: 'Ngày bắt đầu không đúng định dạng.' })
  from?: string;

  /** Biên trên của khoảng ngày vào hàng đợi (F20). */
  @IsOptional()
  @IsDateString({}, { message: 'Ngày kết thúc không đúng định dạng.' })
  to?: string;
}
