import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { DeclarationType } from '../../../../declarations/domain/declaration.enums';
import { FeeTransactionMethod, FeeType, FeeUnit } from '../../../domain/fee.enums';

/** Ngày `YYYY-MM-DD` — biểu phí luôn làm việc với chuỗi ngày, không phải mốc thời gian có múi giờ. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Ô lọc chưa chọn được giao diện gửi lên dạng chuỗi rỗng — coi như không lọc, không phải 400. */
const emptyToUndefined = Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));

/**
 * `forbidNonWhitelisted` đang bật nên **mọi trường web gửi lên phải được khai ở đây** — thiếu một
 * trường là cả yêu cầu bị từ chối 400, không phải trường đó bị bỏ qua.
 *
 * Tiền luôn là **số nguyên đồng** (`@IsInt`): nhận số thực ở biên là mở đường cho sai số tích lũy
 * xuống tận báo cáo đối soát.
 */
export class AdjustFeeChargeRequest {
  @IsString()
  @MaxLength(32, { message: 'Mã khoản phí tối đa 32 ký tự.' })
  ruleCode!: string;

  @Type(() => Number)
  @IsInt({ message: 'Số tiền điều chỉnh phải là số nguyên đồng.' })
  @Min(0, { message: 'Số tiền điều chỉnh không được âm.' })
  amount!: number;

  @IsString()
  @MaxLength(32, { message: 'Mã lý do tối đa 32 ký tự.' })
  reasonCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Nội dung lý do tối đa 500 ký tự.' })
  reasonNote?: string;
}

/**
 * Thu phí **một nhịp** — ghi thẳng một giao dịch đã xác nhận (F47 + F48 gộp). Request thu phí **duy
 * nhất**, dùng cho cả bàn làm việc thu ngân lẫn màn phí theo hồ sơ. `referenceCode` để trống với tiền
 * mặt; phương thức khác web bắt buộc nhập (và luôn kiểm lại ở server). `attachmentId` là biên lai/chứng
 * từ đính kèm (tùy chọn). Tiền là **số nguyên đồng** (`@IsInt`) như mọi biên tiền khác của phân hệ.
 */
export class CollectFeeRequest {
  @Type(() => Number)
  @IsInt({ message: 'Số tiền giao dịch phải là số nguyên đồng.' })
  @Min(1, { message: 'Số tiền giao dịch phải lớn hơn 0.' })
  amount!: number;

  @IsEnum(FeeTransactionMethod, {
    message: 'Phương thức thanh toán chỉ nhận CASH, TRANSFER hoặc E_WALLET.',
  })
  method!: FeeTransactionMethod;

  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'Mã giao dịch/biên lai tối đa 64 ký tự.' })
  referenceCode?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Mã tệp chứng từ không đúng định dạng.' })
  attachmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự.' })
  note?: string;
}

/** Thân yêu cầu tính lại phí — hiện chưa có tham số nào, khai rỗng để `{}` không bị từ chối. */
export class CalculateFeesRequest {}

/**
 * Thân yêu cầu một thao tác đối soát trên màn thu phí theo lực lượng (`POST /fees/:slug/actions/:action`).
 *
 * `note` (lý do/ghi chú) **bắt buộc**: mọi hành động của màn này (thanh toán bổ sung, hủy, gộp hóa đơn)
 * đều là điều chỉnh cần lý do — SRS 5.7 và tiêu chí F47 yêu cầu "điều chỉnh số tiền bắt buộc có lý do".
 * Trước đây thân yêu cầu không có DTO nên ValidationPipe bỏ qua và bỏ trống lý do vẫn lưu (BUG-029).
 */
export class FeeWorkbenchActionRequest {
  @IsOptional()
  @IsUUID('4', { message: 'Mã hồ sơ không đúng định dạng.' })
  declarationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'Mã tờ khai phí tối đa 64 ký tự.' })
  feeCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số tiền phải là số nguyên đồng.' })
  @Min(0, { message: 'Số tiền không được âm.' })
  amount?: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Vui lòng nhập lý do/ghi chú cho thao tác điều chỉnh phí.' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do/ghi chú cho thao tác điều chỉnh phí.' })
  @MaxLength(500, { message: 'Lý do/ghi chú tối đa 500 ký tự.' })
  note!: string;
}

/**
 * Bộ lọc cho lệnh xuất đối soát phí (`GET /fees/:slug/export`) — khớp đúng các bộ lọc đang xem ở màn
 * thu phí: từ khóa tra cứu, nhóm trạng thái, loại phí và khoảng ngày lập. Xuất **ở máy chủ** để đọc số
 * thật và ghi được nhật ký ai xuất, lúc nào (BUG-028).
 */
export class FeeExportRequest {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Từ khóa tra cứu tối đa 200 ký tự.' })
  @emptyToUndefined
  keyword?: string;

  @IsOptional()
  @IsIn(['ALL', 'WAITING', 'PAID', 'OVERDUE'], { message: 'Bộ lọc trạng thái không hợp lệ.' })
  @emptyToUndefined
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã loại phí tối đa 32 ký tự.' })
  @emptyToUndefined
  feeType?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN, { message: 'Từ ngày có dạng YYYY-MM-DD.' })
  @emptyToUndefined
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN, { message: 'Đến ngày có dạng YYYY-MM-DD.' })
  @emptyToUndefined
  to?: string;
}

export class ListFeeRulesRequest {
  @IsOptional()
  @IsEnum(DeclarationType, { message: 'Loại hồ sơ không hợp lệ.' })
  dossierType?: DeclarationType;

  @IsOptional()
  @IsString()
  @MaxLength(10, { message: 'Ngày áp dụng có dạng YYYY-MM-DD.' })
  at?: string;
}

/**
 * Thêm một bản biểu phí (F46). `amount` là **số nguyên đồng** (`@IsInt`) — với đơn vị `PERCENT` đây
 * là tỷ lệ phần trăm nguyên (10 = 10%); tiền không bao giờ nhận số thực ở biên.
 */
export class CreateFeeRuleRequest {
  @IsString()
  @Matches(/^[A-Z0-9_]{2,32}$/, {
    message: 'Mã khoản phí chỉ gồm chữ hoa, số và gạch dưới, dài 2–32 ký tự.',
  })
  code!: string;

  @IsString()
  @MaxLength(160, { message: 'Tên khoản phí tối đa 160 ký tự.' })
  name!: string;

  @IsEnum(FeeType, { message: 'Nhóm phí không hợp lệ.' })
  feeType!: FeeType;

  @IsEnum(FeeUnit, { message: 'Đơn vị tính không hợp lệ.' })
  unit!: FeeUnit;

  @Type(() => Number)
  @IsInt({ message: 'Mức phí phải là số nguyên.' })
  @Min(0, { message: 'Mức phí không được âm.' })
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(8, { message: 'Mã tiền tệ tối đa 8 ký tự.' })
  currency?: string;

  @IsOptional()
  @IsArray({ message: 'Danh sách đối tượng áp dụng phải là danh sách.' })
  @IsString({ each: true, message: 'Mã đối tượng áp dụng không hợp lệ.' })
  appliesTo?: string[];

  @IsString()
  @Matches(DATE_PATTERN, { message: 'Ngày hiệu lực có dạng YYYY-MM-DD.' })
  effectiveFrom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự.' })
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Thứ tự sắp xếp phải là số nguyên.' })
  @Min(0, { message: 'Thứ tự sắp xếp không được âm.' })
  sortOrder?: number;
}

/**
 * Sửa một bản biểu phí (F46). Mọi trường tùy chọn — use-case quyết định trường nào được áp theo
 * trạng thái bản (bản đã áp dụng chỉ nhận metadata phi-tiền). `code` và `effectiveFrom` **không**
 * khai ở đây vì là khóa của bản, không cho sửa.
 */
export class UpdateFeeRuleRequest {
  @IsOptional()
  @IsString()
  @MaxLength(160, { message: 'Tên khoản phí tối đa 160 ký tự.' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự.' })
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Thứ tự sắp xếp phải là số nguyên.' })
  @Min(0, { message: 'Thứ tự sắp xếp không được âm.' })
  sortOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Mức phí phải là số nguyên.' })
  @Min(0, { message: 'Mức phí không được âm.' })
  amount?: number;

  @IsOptional()
  @IsEnum(FeeUnit, { message: 'Đơn vị tính không hợp lệ.' })
  unit?: FeeUnit;

  @IsOptional()
  @IsEnum(FeeType, { message: 'Nhóm phí không hợp lệ.' })
  feeType?: FeeType;

  @IsOptional()
  @IsArray({ message: 'Danh sách đối tượng áp dụng phải là danh sách.' })
  @IsString({ each: true, message: 'Mã đối tượng áp dụng không hợp lệ.' })
  appliesTo?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(8, { message: 'Mã tiền tệ tối đa 8 ký tự.' })
  currency?: string;

  @IsOptional()
  @IsBoolean({ message: 'Trạng thái bật/tắt không hợp lệ.' })
  active?: boolean;
}
