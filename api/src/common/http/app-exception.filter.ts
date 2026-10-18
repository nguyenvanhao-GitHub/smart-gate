import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { MessageKey, MessageParams } from '../i18n/message-catalog';
import { isMessageKey, resolveLocale, translate } from '../i18n/translate';

/**
 * Bộ lọc ngoại lệ toàn cục — **chỗ duy nhất** định hình thân phản hồi lỗi của API.
 *
 * Hình dạng chốt với client:
 * ```json
 * { "statusCode": 400, "error": "Bad Request",
 *   "message": "Tệp vượt quá dung lượng cho phép (tối đa 20 MB).",
 *   "messageKey": "file.tooLarge", "messageParams": { "max": 20 } }
 * ```
 *
 * Ba điều bắt buộc giữ:
 * 1. **Giữ nguyên mọi trường lỗi sẵn có** — `errors[]` của kiểm tra hồ sơ, `blockingReasons` của
 *    cổng, và cả `message` dạng mảng của `ValidationPipe`. Bộ lọc chỉ *thêm* thông tin, không cắt.
 * 2. **Luôn có `message` đọc được** — không bao giờ trả khóa trần ra ngoài.
 * 3. **Dịch theo `Accept-Language`** khi lỗi có `messageKey`; không gửi header thì tiếng Việt.
 *    Lỗi chưa gắn khóa (ngoại lệ Nest thuần, `ValidationPipe`) giữ nguyên lời văn gốc — client rơi
 *    về `message` theo đúng nguyên tắc fail-soft.
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{ headers?: Record<string, string | string[] | undefined> }>();
    const response = http.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
      headersSent?: boolean;
    }>();
    const locale = resolveLocale(request?.headers?.['accept-language']);

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : null;
    const body = this.buildBody(status, payload, locale);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${status} ${String(body['message'])}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // Phản hồi dạng luồng (tải tệp) có thể đã gửi header trước khi lỗi — không ghi đè được nữa.
    if (response?.headersSent) return;
    response.status(status).json(body);
  }

  private buildBody(status: number, payload: unknown, locale: string): Record<string, unknown> {
    const base: Record<string, unknown> =
      payload && typeof payload === 'object' ? { ...(payload as Record<string, unknown>) } : {};

    const key = base['messageKey'];
    if (isMessageKey(key)) {
      base['message'] = translate(key, base['messageParams'] as MessageParams | undefined, locale);
    } else if (typeof payload === 'string') {
      base['message'] = payload;
    } else if (base['message'] === undefined) {
      base['message'] = translate(this.fallbackKey(status), undefined, locale);
    } else if (Array.isArray(base['message'])) {
      base['message'] = (base['message'] as unknown[]).map((msg: unknown) => {
        if (typeof msg === 'string') {
          const trimmed = msg.trim();
          if (isMessageKey(trimmed)) {
            return translate(trimmed, undefined, locale);
          }
          const dotIdx = trimmed.indexOf('.');
          if (dotIdx > 0) {
            const potentialKey = trimmed.slice(dotIdx + 1);
            if (isMessageKey(potentialKey)) {
              return translate(potentialKey, undefined, locale);
            }
          }
        }
        return msg;
      });
    }

    if (Array.isArray(base['errors'])) {
      base['errors'] = base['errors'].map((err: unknown) => {
        if (err && typeof err === 'object' && 'messageKey' in err) {
          const e = err as Record<string, unknown>;
          if (typeof e.messageKey === 'string' && isMessageKey(e.messageKey)) {
            return {
              ...e,
              message: translate(e.messageKey, e.messageParams as Record<string, string> | undefined, locale),
            };
          }
        }
        return err;
      });
    }

    base['statusCode'] = status;
    if (base['error'] === undefined) base['error'] = this.errorText(status);
    return base;
  }

  /** Lỗi không mang khóa (thường là ngoại lệ ngoài dự kiến) vẫn phải có câu chữ tử tế. */
  private fallbackKey(status: number): MessageKey {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'common.badRequest';
      case HttpStatus.UNAUTHORIZED:
        return 'common.unauthorized';
      case HttpStatus.FORBIDDEN:
        return 'common.forbidden';
      case HttpStatus.NOT_FOUND:
        return 'common.notFound';
      case HttpStatus.CONFLICT:
        return 'common.conflict';
      default:
        return 'common.serverError';
    }
  }

  private errorText(status: number): string {
    const name = HttpStatus[status];
    if (!name) return 'Error';
    return name
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
