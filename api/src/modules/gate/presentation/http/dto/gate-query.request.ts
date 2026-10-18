import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQuery } from '../../../../../common/http/pagination.query';
import { GateDirection } from '../../../../catalog/domain/border-facility.catalog';
import { GateDecision } from '../../../domain/gate-event.entity';

/**
 * Tra cứu hồ sơ tại cổng. Hiện nhận **mã hồ sơ** gõ tay; khi chốt thiết bị đọc QR (điểm C2) thì
 * web bóc mã ra khỏi chuỗi QR rồi gọi đúng tham số này — không phải đổi hợp đồng dữ liệu.
 */
export class GateLookupRequest {
  @IsString()
  @MaxLength(64, { message: 'Mã hồ sơ tối đa 64 ký tự.' })
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã cổng tối đa 32 ký tự.' })
  gateCode?: string;

  @IsOptional()
  @IsEnum(GateDirection, { message: 'Hướng cổng phải là ENTRY hoặc EXIT.' })
  direction?: GateDirection;
}

/** `forbidNonWhitelisted` đang bật nên mọi tham số lọc nhật ký cổng phải được khai đủ ở đây. */
export class ListGateEventsRequest extends PaginationQuery {
  @IsOptional()
  @IsUUID('4', { message: 'Mã hồ sơ không đúng định dạng.' })
  dossierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'Mã hồ sơ tối đa 64 ký tự.' })
  dossierCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Biển số xe tối đa 32 ký tự.' })
  plateNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã cổng tối đa 32 ký tự.' })
  gateCode?: string;

  @IsOptional()
  @IsEnum(GateDirection, { message: 'Hướng cổng phải là ENTRY hoặc EXIT.' })
  direction?: GateDirection;

  @IsOptional()
  @IsEnum(GateDecision, { message: 'Kết quả phải là ALLOW hoặc DENY.' })
  decision?: GateDecision;

  @IsOptional()
  @IsString()
  @MaxLength(128, { message: 'Tên người xử lý tối đa 128 ký tự.' })
  actorName?: string;

  @IsOptional()
  @IsISO8601({ strict: false }, { message: 'Tham số from phải là mốc thời gian hợp lệ.' })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: false }, { message: 'Tham số to phải là mốc thời gian hợp lệ.' })
  to?: string;
}

/** `GET /gate/summary` — tổng hợp lượt qua cổng theo cổng (tùy chọn). */
export class GateSummaryRequest {
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã cổng tối đa 32 ký tự.' })
  gateCode?: string;
}
