import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AppointmentStatus, statusesForGroup } from '../../domain/declaration.enums';
import { AppointmentInfo } from '../../domain/declaration.entity';
import { AppointmentPartRequest } from './dto/dossier-parts.request';
import { AttachDocumentsUseCase } from '../../application/use-cases/attach-documents.use-case';
import { CancelDeclarationUseCase } from '../../application/use-cases/cancel-declaration.use-case';
import { CopyDeclarationUseCase } from '../../application/use-cases/copy-declaration.use-case';
import { CreateDeclarationUseCase } from '../../application/use-cases/create-declaration.use-case';
import { DeleteDeclarationUseCase } from '../../application/use-cases/delete-declaration.use-case';
import { DetachDocumentUseCase } from '../../application/use-cases/detach-document.use-case';
import { GetDeclarationDetailUseCase } from '../../application/use-cases/get-declaration-detail.use-case';
import { ListDeclarationsUseCase } from '../../application/use-cases/list-declarations.use-case';
import { SubmitDeclarationUseCase } from '../../application/use-cases/submit-declaration.use-case';
import { UpdateDeclarationUseCase } from '../../application/use-cases/update-declaration.use-case';
import { AttachDocumentsRequest } from './dto/attach-documents.request';
import { CancelDeclarationRequest } from './dto/cancel-declaration.request';
import { CreateDeclarationRequest } from './dto/create-declaration.request';
import { ListDeclarationsQuery } from './dto/list-declarations.query';
import { UpdateDeclarationRequest } from './dto/update-declaration.request';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { CurrentAccess } from '../../../../common/auth/current-access.decorator';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { parseFilterEndDate, parseFilterStartDate } from '../../../../common/time/vietnam-date';
import { AuthTokenPayload } from '../../../identity/application/services/auth-token.service';

@ApiBearerAuth()
@ApiTags('Declarations')
@Controller('declarations')
export class DeclarationsController {
  constructor(
    private readonly listDeclarations: ListDeclarationsUseCase,
    private readonly createDeclaration: CreateDeclarationUseCase,
    private readonly copyDeclaration: CopyDeclarationUseCase,
    private readonly updateDeclaration: UpdateDeclarationUseCase,
    private readonly deleteDeclaration: DeleteDeclarationUseCase,
    private readonly getDeclarationDetail: GetDeclarationDetailUseCase,
    private readonly submitDeclaration: SubmitDeclarationUseCase,
    private readonly attachDocuments: AttachDocumentsUseCase,
    private readonly detachDocument: DetachDocumentUseCase,
    private readonly cancelDeclaration: CancelDeclarationUseCase,
  ) {}

  /** Danh sách hồ sơ có phân trang (UI-03). */
  @RequirePermission('dossier.view')
  @Get()
  list(@Query() query: ListDeclarationsQuery, @CurrentAccess() access: UserAccessContext) {
    return this.listDeclarations.execute({
      access,
      type: query.type,
      status: query.status,
      // Nhóm trạng thái → `status IN (...)`, dùng chung hằng với KPI dashboard để số khớp danh sách.
      statuses: statusesForGroup(query.statusGroup),
      checkpoint: query.checkpoint,
      epidemic: query.epidemic,
      keyword: query.keyword,
      taxCode: query.taxCode,
      fromDate: parseFilterStartDate(query.from),
      toDate: parseFilterEndDate(query.to),
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** Tạo hồ sơ nháp. */
  @RequirePermission('dossier.create')
  @Post()
  create(@Body() body: CreateDeclarationRequest, @CurrentUser() actor: AuthTokenPayload) {
    return this.createDeclaration.execute({
      type: body.type,
      checkpoint: body.checkpoint,
      enterprise: body.enterprise,
      vehicles: body.vehicles ?? [],
      cargoItems: body.cargoItems,
      transshipmentVehicles: body.transshipmentVehicles,
      appointment: this.toAppointment(body.appointment) ?? undefined,
      feeDeclarationCode: body.feeDeclarationCode,
      actorId: actor?.sub ?? '',
      actorRole: Array.isArray(actor?.roles) ? actor.roles.join('+') : '',
    });
  }

  /**
   * Chuẩn hoá lịch hẹn từ request: đổi `scheduledAt` sang `Date`, mặc định trạng thái `SCHEDULED`.
   *
   * Giữ đúng ba trạng thái đầu vào cho `update`: `undefined` (không gửi → giữ nguyên lịch hẹn),
   * `null` (xoá lịch hẹn), và đối tượng (đặt/đổi lịch hẹn).
   */
  private toAppointment(
    part: AppointmentPartRequest | null | undefined,
  ): AppointmentInfo | null | undefined {
    if (part === undefined) return undefined;
    if (part === null) return null;
    return {
      ...part,
      scheduledAt: new Date(part.scheduledAt),
      status: part.status ?? AppointmentStatus.SCHEDULED,
    };
  }

  /**
   * CR3 — Sao chép hồ sơ: dựng bản nháp mới từ hồ sơ nguồn (kèm tệp đính kèm), trả chi tiết bản mới
   * để web mở màn sửa. Cần quyền tạo hồ sơ (`dossier.create`).
   */
  @RequirePermission('dossier.create')
  @Post(':id/copy')
  copy(
    @Param('id') id: string,
    @CurrentAccess() access: UserAccessContext,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    return this.copyDeclaration.execute({
      declarationId: id,
      access,
      actorId: actor?.sub ?? '',
      actorRole: Array.isArray(actor?.roles) ? actor.roles.join('+') : '',
    });
  }

  /** Cập nhật hồ sơ nháp — gồm cả tài xế, dòng hàng và lịch hẹn. */
  @RequirePermission('dossier.update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateDeclarationRequest,
    @CurrentAccess() access: UserAccessContext,
  ) {
    return this.updateDeclaration.execute({
      declarationId: id,
      access,
      type: body.type,
      checkpoint: body.checkpoint,
      enterprise: body.enterprise,
      vehicles: body.vehicles,
      cargoItems: body.cargoItems,
      transshipmentVehicles: body.transshipmentVehicles,
      appointment: this.toAppointment(body.appointment),
      feeDeclarationCode: body.feeDeclarationCode,
    });
  }

  /** Xóa hồ sơ nháp. */
  @RequirePermission('dossier.delete')
  @Delete(':id')
  delete(@Param('id') id: string, @CurrentAccess() access: UserAccessContext) {
    return this.deleteDeclaration.execute(id, access);
  }

  /** Chi tiết hồ sơ đầy đủ cả tiến độ liên ngành (UI-05). */
  @RequirePermission('dossier.view')
  @Get(':id')
  getDetail(@Param('id') id: string, @CurrentAccess() access: UserAccessContext) {
    return this.getDeclarationDetail.execute(id, access);
  }

  /** Gửi hồ sơ (F13 + F14): kiểm tra đầy đủ, đổi trạng thái và trả mã QR. */
  @RequirePermission('dossier.create', 'dossier.update')
  @Post(':id/actions/submit')
  submit(
    @Param('id') id: string,
    @CurrentAccess() access: UserAccessContext,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    return this.submitDeclaration.execute({
      declarationId: id,
      actorId: actor?.sub ?? '',
      actorRole: Array.isArray(actor?.roles) ? actor.roles.join('+') : '',
      access,
    });
  }

  /** Gắn tệp đã tải lên vào hồ sơ. */
  @RequirePermission('dossier.update')
  @Post(':id/attachments')
  attach(
    @Param('id') id: string,
    @Body() body: AttachDocumentsRequest,
    @CurrentAccess() access: UserAccessContext,
  ) {
    return this.attachDocuments.execute({ declarationId: id, attachmentIds: body.attachmentIds, access });
  }

  /** Gỡ tệp khỏi hồ sơ — không xóa tệp trên kho lưu trữ. */
  @RequirePermission('dossier.update')
  @Delete(':id/attachments/:attachmentId')
  detach(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentAccess() access: UserAccessContext,
  ) {
    return this.detachDocument.execute(id, attachmentId, access);
  }

  /*
   * ⚠️ Hai endpoint cũ đã **gỡ ở P3**, cố tình không giữ lại:
   *   - `POST :id/actions/confirm`          → dùng `POST /workflow/dossiers/:id/actions/decide`
   *   - `POST :id/actions/request-revision` → dùng `decide` với `decision = REQUEST_SUPPLEMENT`
   * Lý do: cả hai ghi thẳng vào hồ sơ mà không đi qua phiên xử lý liên ngành, nên **không chặn
   * sai thứ tự bước** và endpoint yêu cầu bổ sung còn **không bắt buộc mã nguyên nhân** — trái F23.
   */

  /**
   * Hủy hồ sơ: doanh nghiệp tự hủy hồ sơ của mình (`dossier.delete` hoặc `dossier.update`)
   * hoặc quản trị/lực lượng chuyên ngành (`workflow.approve`).
   */
  @RequirePermission('dossier.delete', 'dossier.update', 'workflow.approve')
  @Post(':id/actions/cancel')
  cancel(
    @Param('id') id: string,
    @Body() body: CancelDeclarationRequest,
    @CurrentUser() actor: AuthTokenPayload,
    @CurrentAccess() access: UserAccessContext,
  ) {
    return this.cancelDeclaration.execute(
      id,
      actor?.sub ?? '',
      Array.isArray(actor?.roles) ? actor.roles.join('+') : '',
      body?.note,
      access,
    );
  }
}
