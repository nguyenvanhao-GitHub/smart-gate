import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthTokenPayload } from '../../modules/identity/application/services/auth-token.service';
import { RequestContext } from '../context/request-context';
import { ACCESS_CONTEXT_PROVIDER, AccessContextProvider, UserAccessContext, hasAnyPermission } from './access-context';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AUTHENTICATED_ONLY_KEY, REQUIRE_PERMISSION_KEY } from './require-permission.decorator';
import { appForbidden, appUnauthorized } from '../i18n';

interface AuthorizedRequest {
  user?: AuthTokenPayload;
  access?: UserAccessContext;
}

/**
 * Guard phân quyền chạy **sau** AccessTokenGuard. Mặc định chặn: endpoint không khai báo
 * `@Public()`, `@AuthenticatedOnly()` hay `@RequirePermission(...)` sẽ bị từ chối.
 *
 * Quyền được nạp từ DB theo `sub` của token (không nhồi vào token) để quản trị viên đổi ma trận
 * phân quyền là có hiệu lực ngay ở lần gọi kế tiếp, không phải chờ người dùng đăng nhập lại.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_CONTEXT_PROVIDER)
    private readonly accessContexts: AccessContextProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    const user = request?.user;
    if (!user) throw appUnauthorized('auth.unknownActor');

    const access = await this.accessContexts.loadForUser(user.sub);
    request.access = access;
    // Ảnh chụp kiểm toán ghi **danh sách vai trò RBAC** (nối bằng dấu `+`), không phải mã vai trò cũ.
    RequestContext.setActor(user.sub, user.roles.join('+'), user.username);

    if (this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_ONLY_KEY, targets)) return true;

    const required = this.reflector.getAllAndOverride<string[]>(REQUIRE_PERMISSION_KEY, targets);
    if (!required || required.length === 0) {
      throw appForbidden('auth.endpointNotDeclared');
    }

    if (!hasAnyPermission(access, required)) {
      throw appForbidden('auth.permissionDenied', { permissions: required.join(' hoặc ') });
    }

    return true;
  }
}
