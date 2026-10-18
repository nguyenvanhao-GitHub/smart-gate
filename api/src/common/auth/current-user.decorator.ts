import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthTokenPayload } from '../../modules/identity/application/services/auth-token.service';
import { appUnauthorized } from '../i18n';

/** Lấy actor đã được AccessTokenGuard gắn vào request. Chỉ dùng cho endpoint không @Public(). */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthTokenPayload => {
  const request = context.switchToHttp().getRequest<{ user?: AuthTokenPayload }>();
  if (!request?.user) throw appUnauthorized('auth.unknownActor');
  return request.user;
});
