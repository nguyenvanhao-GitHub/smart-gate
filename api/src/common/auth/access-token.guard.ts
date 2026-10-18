import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthTokenPayload, AuthTokenService } from '../../modules/identity/application/services/auth-token.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { appUnauthorized } from '../i18n';

interface AuthenticatedRequest {
  headers?: Record<string, string | string[] | undefined>;
  user?: AuthTokenPayload;
}

/** Guard toàn cục: mọi endpoint đều yêu cầu Bearer token trừ khi được đánh dấu @Public(). */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AuthTokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) throw appUnauthorized('auth.missingToken');

    request.user = this.tokens.verify(token);
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | null {
    const header = request?.headers?.authorization;
    const authorization = Array.isArray(header) ? header[0] : header;
    if (!authorization) return null;
    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    return token.length > 0 ? token : null;
  }
}
