import { computed, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, map, Observable, switchMap, tap, throwError } from 'rxjs';
import { ApiService } from '../services/api.service';
import {
  AccessProfile,
  firstMenuRoute,
  hasAnyPermission,
  PermissionRequirement,
} from './access-control.model';
import {
  clearStoredSession,
  readRefreshToken,
  readStoredSession,
  updateStoredTokens,
  writeStoredSession,
} from './session.storage';

/** Trang luôn truy cập được — dùng làm điểm rơi khi menu chưa có mục nào. */
const FALLBACK_ROUTE = '/profile';

const AVATAR_STORAGE_KEY_PREFIX = 'smart-gate-avatar-';

function getStoredAvatar(userId?: string | null): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(`${AVATAR_STORAGE_KEY_PREFIX}${userId}`) || null;
  } catch {
    return null;
  }
}

function setStoredAvatar(userId: string, avatarUrl: string | null): void {
  try {
    if (avatarUrl) {
      localStorage.setItem(`${AVATAR_STORAGE_KEY_PREFIX}${userId}`, avatarUrl);
    } else {
      localStorage.removeItem(`${AVATAR_STORAGE_KEY_PREFIX}${userId}`);
    }
  } catch {
    // Bỏ qua lỗi hạn mức lưu trữ trình duyệt.
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly stored = readStoredSession();
  private readonly accessTokenSignal = signal<string>(this.stored?.accessToken || '');
  private readonly profileSignal = signal<AccessProfile | null>(this.stored?.profile || null);
  private readonly userAvatarSignal = signal<string | null>(getStoredAvatar(this.stored?.profile?.user?.id));

  readonly profile = this.profileSignal.asReadonly();
  readonly currentUser = computed(() => this.profileSignal()?.user ?? null);
  readonly avatarUrl = computed(() => this.userAvatarSignal() || this.currentUser()?.avatarUrl || null);
  readonly roles = computed(() => this.profileSignal()?.roles ?? []);
  readonly permissions = computed(() => this.profileSignal()?.permissions ?? []);
  readonly assignments = computed(() => this.profileSignal()?.assignments ?? []);
  readonly menu = computed(() => this.profileSignal()?.menu ?? []);
  readonly isAuthenticated = computed(() => !!this.accessTokenSignal() && !!this.profileSignal());

  /** Tên các vai trò hiển thị cạnh avatar (API trả, không hard-code). */
  readonly roleNames = computed(() => this.roles().map((role) => role.name).join(' · '));
  readonly roleCodes = computed(() => this.roles().map((role) => role.code));

  constructor(
    private readonly router: Router,
    private readonly api: ApiService,
  ) {}

  login(username: string, password: string, remember = false): Observable<AccessProfile> {
    return this.api.login(username, password).pipe(
      tap((response) => {
        this.accessTokenSignal.set(response.accessToken);
        writeStoredSession(
          {
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            profile: null,
          },
          remember,
        );
      }),
      switchMap(() => this.api.getAccessProfile()),
      tap((profile) => this.setProfile(profile)),
      catchError((error) => {
        this.clearSession();
        return throwError(() => error);
      }),
    );
  }

  /** Tải lại quyền/menu sau khi quản trị đổi phân quyền hoặc người dùng sửa hồ sơ cá nhân. */
  refreshProfile(): Observable<AccessProfile> {
    return this.api.getAccessProfile().pipe(tap((profile) => this.setProfile(profile)));
  }

  /** Gia hạn phiên làm việc ngầm bằng Refresh Token. */
  refreshToken(): Observable<string> {
    const token = readRefreshToken();
    if (!token) {
      return throwError(() => new Error('Không tìm thấy refresh token'));
    }
    return this.api.refreshToken(token).pipe(
      tap((response) => {
        this.accessTokenSignal.set(response.accessToken);
        updateStoredTokens(response.accessToken, response.refreshToken);
      }),
      map((response) => response.accessToken),
    );
  }

  /** SG-85: Cập nhật và lưu trữ bền vững ảnh đại diện của người dùng. */
  updateAvatar(avatarUrl: string | null): void {
    const userId = this.currentUser()?.id;
    if (userId) {
      setStoredAvatar(userId, avatarUrl);
    }
    this.userAvatarSignal.set(avatarUrl);
    const profile = this.profileSignal();
    if (profile && profile.user) {
      profile.user.avatarUrl = avatarUrl;
      this.profileSignal.set({ ...profile });
      const current = readStoredSession();
      writeStoredSession({
        accessToken: this.accessTokenSignal(),
        refreshToken: current?.refreshToken,
        profile,
      });
    }
  }

  logout(): void {
    this.clearSession();
    void this.router.navigate(['/login']);
  }

  /**
   * Phiên hết hạn — do `auth-token.interceptor` gọi khi API trả 401.
   * Xóa phiên rồi đưa về trang đăng nhập kèm `returnUrl` để đăng nhập xong
   * quay lại đúng màn hình đang làm dở.
   */
  expireSession(): void {
    const currentUrl = this.router.url;
    const onLoginPage = currentUrl.split('?')[0] === '/login';
    this.clearSession();
    void this.router.navigate(['/login'], { queryParams: onLoginPage ? {} : { returnUrl: currentUrl } });
  }

  /** Fail-closed: yêu cầu rỗng (`[]`, `''`, `null`) trả false — xem `hasAnyPermission`. */
  hasPermission(required: PermissionRequirement): boolean {
    return hasAnyPermission(this.permissions(), required);
  }

  hasRole(roleCode: string): boolean {
    return this.roleCodes().includes(roleCode);
  }

  /** Route mặc định sau đăng nhập = mục menu đầu tiên do API trả về. */
  defaultRoute(): string {
    if (!this.isAuthenticated()) return '/login';
    return firstMenuRoute(this.menu()) || FALLBACK_ROUTE;
  }

  private setProfile(profile: AccessProfile): void {
    const avatar = profile.user?.avatarUrl || getStoredAvatar(profile.user?.id);
    if (avatar && profile.user) {
      profile.user.avatarUrl = avatar;
      setStoredAvatar(profile.user.id, avatar);
    }
    this.userAvatarSignal.set(avatar || null);
    this.profileSignal.set(profile);
    const current = readStoredSession();
    writeStoredSession({
      accessToken: this.accessTokenSignal(),
      refreshToken: current?.refreshToken,
      profile,
    });
  }

  private clearSession(): void {
    this.userAvatarSignal.set(null);
    this.accessTokenSignal.set('');
    this.profileSignal.set(null);
    clearStoredSession();
  }
}
