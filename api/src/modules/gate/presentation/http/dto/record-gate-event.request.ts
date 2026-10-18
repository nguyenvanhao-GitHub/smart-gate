import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { GateDirection } from '../../../../catalog/domain/border-facility.catalog';
import { GateDecision } from '../../../domain/gate-event.entity';

export class GateChecklistItemRequest {
  @IsString()
  @MaxLength(64, { message: 'Mã mục kiểm tra tối đa 64 ký tự.' })
  code!: string;

  @IsBoolean({ message: 'Trạng thái tích chọn phải là true hoặc false.' })
  checked!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú mục kiểm tra tối đa 500 ký tự.' })
  note?: string;
}

/** `forbidNonWhitelisted` đang bật nên mọi trường web gửi lên phải được khai đủ ở đây. */
export class RecordGateEventRequest {
  @IsUUID('4', { message: 'Mã hồ sơ không đúng định dạng.' })
  dossierId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã cổng tối đa 32 ký tự.' })
  gateCode?: string;

  @IsOptional()
  @IsEnum(GateDirection, { message: 'Hướng cổng phải là ENTRY hoặc EXIT.' })
  direction?: GateDirection;

  @IsEnum(GateDecision, { message: 'Quyết định tại cổng chỉ nhận ALLOW hoặc DENY.' })
  decision!: GateDecision;

  // CR2 — nút "Ưu tiên kiểm dịch" tại cổng vào. Bật cờ dịch tễ khi cho xe qua chiều VÀO.
  @IsOptional()
  @IsBoolean({ message: 'Cờ ưu tiên kiểm dịch phải là true hoặc false.' })
  prioritizeQuarantine?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: 'Danh sách mục kiểm tra tối đa 50 dòng.' })
  @ValidateNested({ each: true })
  @Type(() => GateChecklistItemRequest)
  checklist?: GateChecklistItemRequest[];

  // Từ chối cho qua (DENY) BẮT BUỘC nêu lý do — nhật ký sự kiện cổng phải nói được vì sao chặn xe.
  // Chặn ở API, không chỉ ở web: gọi thẳng endpoint mà thiếu lý do vẫn bị từ chối 400.
  // Chỉ kiểm khi DENY hoặc khi có gửi ghi chú (ALLOW không gửi thì bỏ qua) — KHÔNG dùng @IsOptional()
  // vì nó sẽ nuốt luôn @IsNotEmpty khi ghi chú vắng mặt, làm mất ràng buộc bắt buộc lý do của DENY.
  @ValidateIf((dto: RecordGateEventRequest) => dto.decision === GateDecision.DENY || dto.note !== undefined)
  @IsNotEmpty({ message: 'Vui lòng nhập lý do khi từ chối cho qua cổng.' })
  @IsString({ message: 'Lý do từ chối phải là chuỗi ký tự.' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự.' })
  note?: string;
}
