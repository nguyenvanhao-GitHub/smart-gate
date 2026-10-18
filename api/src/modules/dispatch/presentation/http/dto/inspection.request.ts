import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { InspectionStatus } from '../../../domain/inspection-status.rules';

/** Body cho POST /dispatch/assignments/:id/actions/inspection (F44). */
export class InspectionRequest {
  @IsEnum(InspectionStatus, { message: 'Trạng thái kiểm tra không hợp lệ.' })
  status!: InspectionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
