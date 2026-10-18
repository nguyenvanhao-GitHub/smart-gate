import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { MessageKey, MessageParams } from './message-catalog';
import { translate } from './translate';

/**
 * Ngoại lệ có khóa thông báo — cách ném lỗi chuẩn của hệ thống.
 *
 *     throw appNotFound('dossier.notFound');
 *     throw appBadRequest('file.tooLarge', { max: 20 });
 *     throw appConflict('gate.blocked', { dossierCode, gateName }, { blockingReasons });
 *
 * Ba điều được bảo đảm:
 * 1. **Luôn kèm `message` tiếng Việt** (dịch ngay lúc ném) → log server, Swagger và client cũ đọc
 *    được nghĩa; `error.message` của Nest vẫn là câu tiếng Việt như trước.
 * 2. **Kèm `messageKey` + `messageParams`** → client tự dịch sang ngôn ngữ của mình.
 * 3. **Vẫn là ngoại lệ Nest tiêu chuẩn** (`extends NotFoundException`…) → mã HTTP, `instanceof`
 *    và mọi thứ đang chạy giữ nguyên, không phá tương thích ngược.
 *
 * `extra` dùng cho các trường lỗi sẵn có phải giữ nguyên hình dạng: `errors[]` của kiểm tra hồ sơ,
 * `blockingReasons` của cổng.
 */
export interface AppFieldError {
  field: string;
  messageKey: MessageKey;
  messageParams?: MessageParams;
  message?: string;
}

export interface AppErrorBody {
  statusCode: number;
  error: string;
  message: string;
  messageKey: MessageKey;
  messageParams?: MessageParams;
  [extra: string]: unknown;
}

function buildBody(
  status: HttpStatus,
  error: string,
  key: MessageKey,
  params?: MessageParams,
  extra?: Record<string, unknown>,
): AppErrorBody {
  return {
    statusCode: status,
    error,
    // Tiếng Việt là ngôn ngữ mặc định và luôn có mặt; bộ lọc HTTP sẽ dịch lại theo `Accept-Language`.
    message: translate(key, params),
    messageKey: key,
    ...(params && Object.keys(params).length > 0 ? { messageParams: params } : {}),
    ...(extra ?? {}),
  };
}

export class AppBadRequestException extends BadRequestException {
  constructor(key: MessageKey, params?: MessageParams, extra?: Record<string, unknown>) {
    super(buildBody(HttpStatus.BAD_REQUEST, 'Bad Request', key, params, extra));
  }
}

export class AppUnauthorizedException extends UnauthorizedException {
  constructor(key: MessageKey, params?: MessageParams, extra?: Record<string, unknown>) {
    super(buildBody(HttpStatus.UNAUTHORIZED, 'Unauthorized', key, params, extra));
  }
}

export class AppForbiddenException extends ForbiddenException {
  constructor(key: MessageKey, params?: MessageParams, extra?: Record<string, unknown>) {
    super(buildBody(HttpStatus.FORBIDDEN, 'Forbidden', key, params, extra));
  }
}

export class AppNotFoundException extends NotFoundException {
  constructor(key: MessageKey, params?: MessageParams, extra?: Record<string, unknown>) {
    super(buildBody(HttpStatus.NOT_FOUND, 'Not Found', key, params, extra));
  }
}

export class AppConflictException extends ConflictException {
  constructor(key: MessageKey, params?: MessageParams, extra?: Record<string, unknown>) {
    super(buildBody(HttpStatus.CONFLICT, 'Conflict', key, params, extra));
  }
}

export class AppServiceUnavailableException extends ServiceUnavailableException {
  constructor(key: MessageKey, params?: MessageParams, extra?: Record<string, unknown>) {
    super(buildBody(HttpStatus.SERVICE_UNAVAILABLE, 'Service Unavailable', key, params, extra));
  }
}

export class AppInternalServerErrorException extends InternalServerErrorException {
  constructor(key: MessageKey, params?: MessageParams, extra?: Record<string, unknown>) {
    super(buildBody(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error', key, params, extra));
  }
}

// --- Hàm ném lỗi dùng hằng ngày: một dòng, không lặp lại khuôn mẫu -----------

export const appBadRequest = (key: MessageKey, params?: MessageParams, extra?: Record<string, unknown>) =>
  new AppBadRequestException(key, params, extra);

export const appUnauthorized = (key: MessageKey, params?: MessageParams, extra?: Record<string, unknown>) =>
  new AppUnauthorizedException(key, params, extra);

export const appForbidden = (key: MessageKey, params?: MessageParams, extra?: Record<string, unknown>) =>
  new AppForbiddenException(key, params, extra);

export const appNotFound = (key: MessageKey, params?: MessageParams, extra?: Record<string, unknown>) =>
  new AppNotFoundException(key, params, extra);

export const appConflict = (key: MessageKey, params?: MessageParams, extra?: Record<string, unknown>) =>
  new AppConflictException(key, params, extra);

export const appUnavailable = (key: MessageKey, params?: MessageParams, extra?: Record<string, unknown>) =>
  new AppServiceUnavailableException(key, params, extra);

export const appInternalError = (key: MessageKey, params?: MessageParams, extra?: Record<string, unknown>) =>
  new AppInternalServerErrorException(key, params, extra);
