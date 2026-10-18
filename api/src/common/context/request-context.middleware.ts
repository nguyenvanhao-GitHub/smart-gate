import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { RequestContext } from './request-context';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** Sinh (hoặc nhận lại) mã tương quan cho mỗi request và mở ngữ cảnh cho toàn bộ chuỗi xử lý. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const incoming = request.headers[CORRELATION_ID_HEADER];
    const provided = (Array.isArray(incoming) ? incoming[0] : incoming)?.trim();
    const correlationId = provided && provided.length > 0 ? provided.slice(0, 64) : randomUUID();
    
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    RequestContext.run({ correlationId, ip: this.clientIp(request) }, () => next());
  }

  private clientIp(request: Request): string | undefined {
    const forwarded = request.headers['x-forwarded-for'];
    const realIp = request.headers['x-real-ip'];
    const clientIpHeader = request.headers['x-client-ip'];

    const firstForwarded = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    const firstReal = (Array.isArray(realIp) ? realIp[0] : realIp)?.split(',')[0]?.trim();
    const firstClient = (Array.isArray(clientIpHeader) ? clientIpHeader[0] : clientIpHeader)?.split(',')[0]?.trim();

    return firstForwarded || firstReal || firstClient || request.ip || request.socket?.remoteAddress || undefined;
  }
}
