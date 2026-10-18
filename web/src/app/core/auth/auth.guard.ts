import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PermissionRequirement } from './access-control.model';
import { AuthService } from './auth.service';

/**
 * Chặn route theo **quyền** khai trên `data`, không theo vai trò:
 *
 *   { path: 'declarations', component: ..., canActivate: [authGuard],
 *     data: { permission: 'dossier.view' } }
 *   data: { permission: ['fee.view', 'fee.approve'] }   // có bất kỳ quyền nào
 *
 * Route KHÔNG khai `data.permission` nghĩa là không ràng buộc quyền, chỉ cần đăng nhập.
 * Khác hẳn việc khai mảng rỗng tường minh — trường hợp đó `hasAnyPermission` trả false (fail-closed).
 */
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  const required = route.data?.['permission'] as PermissionRequirement;
  const khongRangBuoc = required === undefined || required === null;
  if (!khongRangBuoc && !auth.hasPermission(required)) {
    const fallback = auth.defaultRoute();
    const currentPath = state.url.split('?')[0].split('#')[0];
    // Không được đẩy về chính route vừa bị chặn — sẽ lặp vô hạn.
    return router.createUrlTree([fallback === currentPath ? '/profile' : fallback]);
  }

  return true;
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? router.createUrlTree([auth.defaultRoute()]) : true;
};

/** Điều hướng trang gốc `/` về mục menu đầu tiên do API trả về. */
export const homeRedirectGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  return router.createUrlTree([auth.defaultRoute()]);
};
