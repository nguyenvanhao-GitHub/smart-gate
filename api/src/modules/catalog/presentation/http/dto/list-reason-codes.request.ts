import { IsEnum, IsOptional } from 'class-validator';
import { ReasonScope } from '../../../domain/reason-code.catalog';

export class ListReasonCodesRequest {
  @IsOptional()
  @IsEnum(ReasonScope, {
    message: 'Tham số scope chỉ nhận SUPPLEMENT, REJECT hoặc FEE_ADJUST.',
  })
  scope?: ReasonScope;
}
