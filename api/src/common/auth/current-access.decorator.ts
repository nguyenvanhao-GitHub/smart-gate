import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { UserAccessContext } from './access-context';
import { appForbidden } from '../i18n';

/** Lấy quyền hiệu lực do PermissionsGuard nạp vào request. Chỉ dùng cho endpoint không @Public(). */
export const CurrentAccess = createParamDecorator((_data: unknown, context: ExecutionContext): UserAccessContext => {
  const request = context.switchToHttp().getRequest<{ access?: UserAccessContext }>();
  if (!request?.access) throw appForbidden('auth.unknownAccess');
  return request.access;
});
