import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AuthTokenService } from '../../modules/identity/application/services/auth-token.service';
import { AccessTokenGuard } from './access-token.guard';
import { IS_PUBLIC_KEY } from './public.decorator';

const SECRET = 'secret-danh-cho-kiem-thu';
const SUBJECT = { sub: 'user-1', username: 'admin', roles: ['SYS_ADMIN'] };

function tokenService(): AuthTokenService {
  return new AuthTokenService({
    get: (key: string, defaultValue?: unknown) => (key === 'AUTH_TOKEN_SECRET' ? SECRET : defaultValue),
  } as unknown as ConfigService);
}

/** ExecutionContext giả lập cho tầng HTTP; trả về cả request để kiểm tra request.user sau khi guard chạy. */
function httpContext(headers: Record<string, string | string[] | undefined> = {}) {
  const request: Record<string, unknown> = { headers };
  const context = {
    getHandler: () => function handler(): void {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

function reflectorReturning(isPublic: boolean | undefined): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(isPublic) } as unknown as Reflector;
}

describe('AccessTokenGuard', () => {
  const tokens = tokenService();

  it('cho qua endpoint được đánh dấu @Public() dù không có token', () => {
    const reflector = reflectorReturning(true);
    const guard = new AccessTokenGuard(reflector, tokens);
    const { context, request } = httpContext();

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toBeUndefined();
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, expect.any(Array));
  });

  it('gắn payload vào request.user khi token hợp lệ', () => {
    const guard = new AccessTokenGuard(reflectorReturning(undefined), tokens);
    const { accessToken } = tokens.sign(SUBJECT);
    const { context, request } = httpContext({ authorization: `Bearer ${accessToken}` });

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toMatchObject(SUBJECT);
  });

  it('chấp nhận tiền tố Bearer không phân biệt hoa thường', () => {
    const guard = new AccessTokenGuard(reflectorReturning(undefined), tokens);
    const { accessToken } = tokens.sign(SUBJECT);
    const { context, request } = httpContext({ authorization: `bearer ${accessToken}` });

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toMatchObject(SUBJECT);
  });

  it.each([
    ['không có header Authorization', {}],
    ['header rỗng', { authorization: '' }],
    ['chỉ có chữ Bearer', { authorization: 'Bearer   ' }],
  ])('ném UnauthorizedException khi %s', (_label, headers) => {
    const guard = new AccessTokenGuard(reflectorReturning(undefined), tokens);
    const { context } = httpContext(headers);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('ném UnauthorizedException khi token sai chữ ký', () => {
    const guard = new AccessTokenGuard(reflectorReturning(undefined), tokens);
    const [body] = tokens.sign(SUBJECT).accessToken.split('.');
    const { context, request } = httpContext({ authorization: `Bearer ${body}.chu-ky-gia` });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(request.user).toBeUndefined();
  });

  it('không gọi tới AuthTokenService khi endpoint là @Public()', () => {
    const verify = jest.spyOn(tokens, 'verify');
    const guard = new AccessTokenGuard(reflectorReturning(true), tokens);
    const { context } = httpContext({ authorization: 'Bearer token-rac' });

    expect(guard.canActivate(context)).toBe(true);
    expect(verify).not.toHaveBeenCalled();
    verify.mockRestore();
  });
});
