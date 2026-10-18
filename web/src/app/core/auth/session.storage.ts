import { AccessProfile } from './access-control.model';

/**
 * Lưu phiên đăng nhập. Tách khỏi `AuthService` để interceptor đọc được token
 * mà không phải inject `AuthService` (tránh vòng phụ thuộc với `HttpClient`).
 *
 * "Ghi nhớ đăng nhập" bật → `localStorage` (còn sau khi đóng trình duyệt);
 * tắt → `sessionStorage` (mất khi đóng tab).
 */
export const SESSION_STORAGE_KEY = 'smart-gate-session';

export interface StoredSession {
  accessToken: string;
  refreshToken?: string;
  profile: AccessProfile | null;
}

function stores(): Storage[] {
  try {
    return [sessionStorage, localStorage];
  } catch {
    return [];
  }
}

export function readStoredSession(): StoredSession | null {
  for (const store of stores()) {
    try {
      const raw = store.getItem(SESSION_STORAGE_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as StoredSession;
      if (!parsed?.accessToken) continue;
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        profile: parsed.profile ?? null,
      };
    } catch {
      // Bản ghi hỏng — coi như chưa đăng nhập.
    }
  }
  return null;
}

export function writeStoredSession(session: StoredSession, remember?: boolean): void {
  const [session_, local] = stores();
  if (!session_ || !local) return;
  const keep = remember ?? local.getItem(SESSION_STORAGE_KEY) !== null;
  const target = keep ? local : session_;
  const other = keep ? session_ : local;
  try {
    other.removeItem(SESSION_STORAGE_KEY);
    target.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Trình duyệt chặn lưu trữ — bỏ qua, phiên chỉ tồn tại trong bộ nhớ.
  }
}

export function clearStoredSession(): void {
  stores().forEach((store) => {
    try {
      store.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Bỏ qua.
    }
  });
}

export function readAccessToken(): string {
  return readStoredSession()?.accessToken || '';
}

export function readRefreshToken(): string {
  return readStoredSession()?.refreshToken || '';
}

export function updateStoredTokens(accessToken: string, refreshToken?: string): void {
  const current = readStoredSession();
  if (!current) return;
  current.accessToken = accessToken;
  if (refreshToken) current.refreshToken = refreshToken;
  writeStoredSession(current);
}
