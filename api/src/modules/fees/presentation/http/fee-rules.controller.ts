import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { appBadRequest } from '../../../../common/i18n';
import { AuthTokenPayload } from '../../../identity/application/services/auth-token.service';
import { CreateFeeRuleUseCase } from '../../application/use-cases/create-fee-rule.use-case';
import { ListFeeRuleVersionsUseCase } from '../../application/use-cases/list-fee-rule-versions.use-case';
import { ListFeeRulesUseCase } from '../../application/use-cases/list-fee-rules.use-case';
import { UpdateFeeRuleUseCase } from '../../application/use-cases/update-fee-rule.use-case';
import { CreateFeeRuleRequest, ListFeeRulesRequest, UpdateFeeRuleRequest } from './dto/fee.request';

const RULE_ID_PIPE = new ParseUUIDPipe({
  exceptionFactory: () => appBadRequest('fee.ruleNotFound'),
});

/**
 * Biểu phí (F46). Đường dẫn `catalog/fee-rules` là hợp đồng đã chốt với web — cùng nếp với
 * `catalog/reason-codes` và `catalog/required-documents`.
 *
 * `GET /` trả **bản đang hiệu lực** để đối chiếu khi tính phí (quyền `fee.view`); nhánh Quản trị
 * biểu phí (`GET /admin`, `POST /`, `PATCH /:id`) trả/ghi **mọi bản** và yêu cầu quyền `fee.approve`.
 */
@ApiBearerAuth()
@ApiTags('Fees')
@Controller('catalog/fee-rules')
export class FeeRulesController {
  constructor(
    private readonly listRules: ListFeeRulesUseCase,
    private readonly listVersions: ListFeeRuleVersionsUseCase,
    private readonly createRule: CreateFeeRuleUseCase,
    private readonly updateRule: UpdateFeeRuleUseCase,
  ) {}

  @RequirePermission('fee.view')
  @Get()
  list(@Query() query: ListFeeRulesRequest) {
    return this.listRules.execute({ dossierType: query.dossierType, at: query.at });
  }

  /** Mọi bản biểu phí (kể cả đã đóng / chưa tới) cho màn Quản trị biểu phí (F46). */
  @RequirePermission('fee.approve')
  @Get('admin')
  listAll() {
    return this.listVersions.execute();
  }

  /** Thêm một bản biểu phí — đóng bản đang chạy rồi thêm bản mới, giữ lịch sử (F46). */
  @RequirePermission('fee.approve')
  @HttpCode(HttpStatus.CREATED)
  @Post()
  create(@Body() body: CreateFeeRuleRequest, @CurrentUser() actor: AuthTokenPayload) {
    return this.createRule.execute({
      code: body.code,
      name: body.name,
      feeType: body.feeType,
      unit: body.unit,
      amount: body.amount,
      currency: body.currency,
      appliesTo: body.appliesTo,
      effectiveFrom: body.effectiveFrom,
      description: body.description,
      sortOrder: body.sortOrder,
      actorId: actor.sub,
    });
  }

  /** Sửa một bản — bản đã/đang áp dụng chỉ nhận metadata phi-tiền, sửa mức phí là 409 (F46). */
  @RequirePermission('fee.approve')
  @Patch(':id')
  update(
    @Param('id', RULE_ID_PIPE) id: string,
    @Body() body: UpdateFeeRuleRequest,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    return this.updateRule.execute({
      id,
      name: body.name,
      description: body.description,
      sortOrder: body.sortOrder,
      amount: body.amount,
      unit: body.unit,
      feeType: body.feeType,
      appliesTo: body.appliesTo,
      currency: body.currency,
      active: body.active,
      actorId: actor.sub,
    });
  }
}
