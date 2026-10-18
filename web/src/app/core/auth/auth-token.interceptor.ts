import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { BehaviorSubject, catchError, filter, Observable, switchMap, take, throwError } from 'rxjs';
import { I18nService } from '../i18n/i18n.service';
import { AppMessageService } from '../services/app-message.service';
import { AuthService } from './auth.service';
import { readAccessToken, readRefreshToken } from './session.storage';

/**
 * Cờ dùng chung cho mọi request: khi nhiều lời gọi song song cùng trả 401
 * thì chỉ lần đầu mới xóa phiên và điều hướng, những lần sau bị bỏ qua.
 */
let signingOut = false;
let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

export function resetAuthInterceptorState(): void {
  signingOut = false;
  isRefreshing = false;
  refreshTokenSubject.next(null);
}

/** Request đăng nhập: 401 ở đây là "sai mật khẩu", phải để form tự hiện lỗi. */
function isLoginRequest(request: HttpRequest<unknown>): boolean {
  return request.method === 'POST' && request.url.includes('/auth/login');
}

/** Request làm mới token: 401 ở đây nghĩa là refresh token hết hạn hoặc không hợp lệ. */
function isRefreshRequest(request: HttpRequest<unknown>): boolean {
  return request.method === 'POST' && request.url.includes('/auth/refresh');
}

/** Request đã được retry sau khi refresh token một lần — tránh lặp vô hạn nếu vẫn 401. */
function isRetriedRequest(request: HttpRequest<unknown>): boolean {
  return request.headers.has('x-refreshed');
}

/**
 * Gắn Bearer token + `Accept-Language` vào mọi request và xử lý tập trung lỗi xác thực:
 *
 * - **401** — token hết hạn: tự động gia hạn ngầm (Silent Refresh) bằng refresh token
 *   và retry request gốc. Nếu phiên gia hạn cũng không hợp lệ, xóa phiên và đưa về `/login`.
 * - **403** — đã đăng nhập nhưng không đủ quyền: chỉ báo, **không** đăng xuất.
 */
export const authTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const messages = inject(AppMessageService);
  const i18n = inject(I18nService);

  if (isLoginRequest(request)) {
    resetAuthInterceptorState();
  }

  const accessToken = readAccessToken();
  const headers: Record<string, string> = { 'Accept-Language': i18n.locale() };
  if (accessToken && !request.headers.has('Authorization') && !isRefreshRequest(request)) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  const prepared = request.clone({ setHeaders: headers });

  return next(prepared).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 401) {
          if (isLoginRequest(request)) {
            return throwError(() => error);
          }

          if (isRefreshRequest(request) || isRetriedRequest(request)) {
            isRefreshing = false;
            refreshTokenSubject.next('');
            signOut(auth, messages);
            return throwError(() => error);
          }

          const refreshToken = readRefreshToken();
          if (!refreshToken) {
            signOut(auth, messages);
            return throwError(() => error);
          }

          return handle401Error(request, next, auth, messages);
        } else if (error.status === 403) {
          messages.showKey('ui.shell.forbidden', 'error');
        }
      }
      return throwError(() => error);
    }),
  );
};

function handle401Error(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
  auth: AuthService,
  messages: AppMessageService,
): Observable<HttpEvent<unknown>> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    return auth.refreshToken().pipe(
      switchMap((newAccessToken) => {
        isRefreshing = false;
        refreshTokenSubject.next(newAccessToken);
        const retryRequest = request.clone({
          setHeaders: {
            Authorization: `Bearer ${newAccessToken}`,
            'x-refreshed': 'true',
          },
        });
        return next(retryRequest);
      }),
      catchError((refreshError: unknown) => {
        isRefreshing = false;
        refreshTokenSubject.next('');
        signOut(auth, messages);
        return throwError(() => refreshError);
      }),
    );
  }

  // Đang có request khác thực hiện refresh -> xếp hàng chờ nhận token mới rồi retry
  return refreshTokenSubject.pipe(
    filter((token) => token !== null),
    take(1),
    switchMap((token) => {
      if (!token) {
        return throwError(() => new Error('Phiên làm việc đã hết hạn'));
      }
      const retryRequest = request.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
          'x-refreshed': 'true',
        },
      });
      return next(retryRequest);
    }),
  );
}

function signOut(auth: AuthService, messages: AppMessageService): void {
  if (signingOut) return;
  signingOut = true;
  messages.showKey('ui.shell.sessionExpired', 'warning');
  auth.expireSession();
}
