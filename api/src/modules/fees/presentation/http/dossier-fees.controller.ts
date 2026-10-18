import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { CurrentAccess } from '../../../../common/auth/current-access.decorator';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { AuthTokenPayload } from '../../../identity/application/services/auth-token.service';
import { AdjustFeeChargeUseCase } from '../../application/use-cases/adjust-fee-charge.use-case';
import { CalculateDossierFeesUseCase } from '../../application/use-cases/calculate-dossier-fees.use-case';
import { CollectFeeUseCase } from '../../application/use-cases/collect-fee.use-case';
import { GetDossierFeesUseCase } from '../../application/use-cases/get-dossier-fees.use-case';
import { AdjustFeeChargeRequest, CalculateFeesRequest, CollectFeeRequest } from './dto/fee.request';
import { appBadRequest } from '../../../../common/i18n';

const DOSSIER_ID_PIPE = new ParseUUIDPipe({
  exceptionFactory: () => appBadRequest('dossier.idInvalid'),
});

/**
 * Bảng phí gắn với **một hồ sơ** (F46–F48).
 *
 * Đặt ở phân hệ phí nhưng mang tiền tố `declarations` vì đó là hợp đồng đã chốt với web; chiều phụ
 * thuộc vẫn là `fees` → `declarations`, không có chiều ngược lại. Cùng cách
 * `catalog/required-documents` nằm trong phân hệ `declarations`.
 */
@ApiBearerAuth()
@ApiTags('Fees')
@Controller('declarations')
export class DossierFeesController {
  constructor(
    private readonly getFees: GetDossierFeesUseCase,
    private readonly calculate: CalculateDossierFeesUseCase,
    private readonly adjust: AdjustFeeChargeUseCase,
    private readonly collect: CollectFeeUseCase,
  ) {}

  @RequirePermission('fee.view')
  @Get(':id/fees')
  fees(@Param('id', DOSSIER_ID_PIPE) id: string, @CurrentAccess() access: UserAccessContext) {
    return this.getFees.execute({ dossierId: id, access });
  }

  /** Tính lại phí theo **bản biểu phí đang hiệu lực**; dòng đã điều chỉnh được giữ nguyên (F47). */
  @RequirePermission('fee.update')
  @HttpCode(HttpStatus.OK)
  @Post(':id/fees/actions/calculate')
  calculateFees(
    @Param('id', DOSSIER_ID_PIPE) id: string,
    @Body() _body: CalculateFeesRequest,
    @CurrentAccess() access: UserAccessContext,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    return this.calculate.execute({ dossierId: id, actorId: actor.sub, access });
  }

  /** Điều chỉnh một khoản phí — **thiếu mã lý do là 400**, không phải bỏ qua (F47). */
  @RequirePermission('fee.update')
  @HttpCode(HttpStatus.OK)
  @Post(':id/fees/actions/adjust')
  adjustCharge(
    @Param('id', DOSSIER_ID_PIPE) id: string,
    @Body() body: AdjustFeeChargeRequest,
    @CurrentAccess() access: UserAccessContext,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    return this.adjust.execute({
      dossierId: id,
      ruleCode: body.ruleCode,
      amount: body.amount,
      reasonCode: body.reasonCode,
      reasonNote: body.reasonNote,
      actorId: actor.sub,
      access,
    });
  }

  /**
   * Thu phí **một nhịp** (endpoint thu phí duy nhất, gộp F47 + F48): ghi thẳng một giao dịch đã xác
   * nhận trong một lần lưu, không để lại giao dịch `PENDING` treo. Thu = duyệt tiền nên yêu cầu quyền
   * `fee.approve`. Dùng cho cả bàn làm việc thu ngân lẫn màn phí theo hồ sơ.
   */
  @RequirePermission('fee.approve')
  @HttpCode(HttpStatus.CREATED)
  @Post(':id/fees/collect')
  collectFee(
    @Param('id', DOSSIER_ID_PIPE) id: string,
    @Body() body: CollectFeeRequest,
    @CurrentAccess() access: UserAccessContext,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    return this.collect.execute({
      dossierId: id,
      amount: body.amount,
      method: body.method,
      referenceCode: body.referenceCode,
      attachmentId: body.attachmentId,
      note: body.note,
      actorId: actor.sub,
      access,
    });
  }
}
