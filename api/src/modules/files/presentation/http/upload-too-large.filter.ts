import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, PayloadTooLargeException } from '@nestjs/common';
import { Response } from 'express';
import { MAX_ATTACHMENT_SIZE_MB } from '../../domain/attachment-file.rules';

/**
 * Multer cắt luồng tải lên ngay khi vượt ngưỡng và `@nestjs/platform-express` chuyển lỗi đó thành
 * `PayloadTooLargeException` với thông báo tiếng Anh "File too large". Bộ lọc này viết lại thành
 * thông báo tiếng Việt để người dùng hiểu vì sao bị từ chối.
 */
@Catch(PayloadTooLargeException)
export class UploadTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      message: `Tệp vượt quá dung lượng cho phép (tối đa ${MAX_ATTACHMENT_SIZE_MB} MB).`,
      error: 'Payload Too Large',
    });
  }
}
