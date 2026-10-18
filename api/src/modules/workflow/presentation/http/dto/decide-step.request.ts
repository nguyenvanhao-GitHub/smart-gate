import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ALL_WORKFLOW_STEP_CODES } from '../../../domain/workflow-route';
import { WorkflowDecision } from '../../../domain/workflow.enums';

export class ChecklistItemRequest {
  @IsString()
  @MaxLength(64, { message: 'Mã mục kiểm tra tối đa 64 ký tự.' })
  code!: string;

  @IsBoolean({ message: 'Trường checked phải là true hoặc false.' })
  checked!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú mục kiểm tra tối đa 500 ký tự.' })
  note?: string;
}

export class DecideStepRequest {
  @IsIn(ALL_WORKFLOW_STEP_CODES, { message: 'Mã bước nghiệp vụ không hợp lệ.' })
  stepCode!: string;

  @IsEnum(WorkflowDecision, {
    message: 'Quyết định chỉ nhận APPROVE, REQUEST_SUPPLEMENT hoặc REJECT.',
  })
  decision!: WorkflowDecision;

  /** Bắt buộc với REQUEST_SUPPLEMENT và REJECT — kiểm ở use-case vì phụ thuộc `decision`. */
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Mã nguyên nhân tối đa 32 ký tự.' })
  reasonCode?: string;

  /** Nội dung lý do — kiểm bắt buộc theo `decision` ở use-case. */
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Nội dung lý do tối đa 500 ký tự.' })
  reasonNote?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100, { message: 'Mỗi lần gửi tối đa 100 mục kiểm tra.' })
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemRequest)
  checklist?: ChecklistItemRequest[];
}
