import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { CheckpointCode } from '../../../../declarations/domain/declaration.enums';

/**
 * Tham số của dashboard tổng quan (UI-02). Cùng tên với query param của màn hình danh sách hồ sơ.
 *
 * `@Transform` biến chuỗi rỗng thành `undefined`: giao diện thường gửi `?checkpoint=&from=&to=`
 * khi người dùng chưa chọn gì, mà chuỗi rỗng thì trượt `@IsEnum` và trả 400 — lỗi khó hiểu cho
 * người dùng trong khi ý định của họ chỉ là "không lọc".
 */
const emptyToUndefined = Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));

export class DashboardOverviewRequest {
  @IsOptional()
  @IsEnum(CheckpointCode, { message: 'Mã chốt không hợp lệ.' })
  @emptyToUndefined
  checkpoint?: CheckpointCode;

  @IsOptional()
  @IsDateString({}, { message: 'Ngày bắt đầu không đúng định dạng.' })
  @emptyToUndefined
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Ngày kết thúc không đúng định dạng.' })
  @emptyToUndefined
  to?: string;
}
