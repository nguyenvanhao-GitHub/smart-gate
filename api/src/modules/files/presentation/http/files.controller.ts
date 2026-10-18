import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { UserAccessContext } from '../../../../common/auth/access-context';
import { CurrentAccess } from '../../../../common/auth/current-access.decorator';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../../common/auth/require-permission.decorator';
import { AuthTokenPayload } from '../../../identity/application/services/auth-token.service';
import { DeleteAttachmentUseCase } from '../../application/use-cases/delete-attachment.use-case';
import { DownloadAttachmentUseCase } from '../../application/use-cases/download-attachment.use-case';
import { GetAttachmentMetadataUseCase } from '../../application/use-cases/get-attachment-metadata.use-case';
import { UploadAttachmentUseCase } from '../../application/use-cases/upload-attachment.use-case';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../../domain/attachment-file.rules';
import { UploadFileRequest } from './dto/upload-file.request';
import { buildContentDisposition, decodeMultipartFileName } from './multipart-file.helper';
import { UploadTooLargeFilter } from './upload-too-large.filter';
import { appBadRequest } from '../../../../common/i18n';

/** Mã lỗi dùng chung khi id trên đường dẫn không phải UUID — tránh lộ lỗi kỹ thuật của PostgreSQL. */
const ID_PIPE = new ParseUUIDPipe({
  exceptionFactory: () => appBadRequest('file.idInvalid'),
});

@ApiBearerAuth()
@ApiTags('Files')
@UseFilters(UploadTooLargeFilter)
@Controller('files')
export class FilesController {
  constructor(
    private readonly uploadAttachment: UploadAttachmentUseCase,
    private readonly downloadAttachment: DownloadAttachmentUseCase,
    private readonly getMetadata: GetAttachmentMetadataUseCase,
    private readonly deleteAttachment: DeleteAttachmentUseCase,
  ) {}

  /**
   * Tải tệp lên. Multer dùng bộ nhớ (mặc định của `FileInterceptor`) nên **không ghi tệp tạm ra ổ
   * đĩa** — bỏ hẳn nguy cơ tên tệp độc hại chạm tới hệ thống tệp của máy chủ.
   *
   * Chấp nhận `dossier.create`, `dossier.update`, `workflow.update`, `workflow.approve`,
   * `fee.create`, `fee.update`, `fee.approve`: hỗ trợ tải tệp đính kèm khi tạo/cập nhật hồ sơ,
   * tải ảnh hiện trường khi xử lý liên ngành, và đính kèm chứng từ/biên lai/bill khi thu phí.
   */
  @RequirePermission(
    'dossier.create',
    'dossier.update',
    'workflow.update',
    'workflow.approve',
    'fee.create',
    'fee.update',
    'fee.approve',
  )
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        dossierId: { type: 'string', format: 'uuid' },
        documentTypeCode: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES } }))
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadFileRequest,
    @CurrentUser() actor: AuthTokenPayload,
  ) {
    if (!file) throw appBadRequest('file.notSelected');
    return this.uploadAttachment.execute({
      fileName: decodeMultipartFileName(file.originalname),
      content: file.buffer,
      dossierId: body.dossierId,
      documentTypeCode: body.documentTypeCode,
      actorId: actor.sub,
    });
  }

  /** Tải tệp về dạng luồng. Quyền xem hồ sơ là chưa đủ — use-case còn siết theo phạm vi dữ liệu. */
  @RequirePermission('dossier.view', 'fee.view', 'workflow.view')
  @Get(':id')
  async download(
    @Param('id', ID_PIPE) id: string,
    @CurrentAccess() access: UserAccessContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.downloadAttachment.execute({ attachmentId: id, access });
    const length = result.contentLength ?? result.attachment.sizeBytes;
    response.setHeader('Content-Type', result.attachment.mimeType);
    if (length) {
      response.setHeader('Content-Length', String(length));
    }
    response.setHeader('Content-Disposition', buildContentDisposition(result.attachment.originalName));
    return new StreamableFile(result.stream);
  }

  @RequirePermission('dossier.view', 'fee.view', 'workflow.view')
  @Get(':id/metadata')
  metadata(@Param('id', ID_PIPE) id: string, @CurrentAccess() access: UserAccessContext) {
    return this.getMetadata.execute(id, access);
  }

  @RequirePermission('dossier.view', 'fee.view', 'workflow.view')
  @Post(':id/cancel-download')
  cancelDownload(@Param('id', ID_PIPE) id: string, @CurrentAccess() access: UserAccessContext) {
    return this.downloadAttachment.logCancellation({ attachmentId: id, access });
  }

  /** Xóa mềm: đổi trạng thái bản ghi, giữ nguyên tệp trên kho lưu trữ. */
  @RequirePermission('dossier.update', 'fee.update', 'workflow.update')
  @Delete(':id')
  remove(@Param('id', ID_PIPE) id: string, @CurrentAccess() access: UserAccessContext) {
    return this.deleteAttachment.execute(id, access);
  }
}
