import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { appUnauthorized } from '../../../../common/i18n';

export interface AuthTokenPayload {
  sub: string;
  username: string;
  /** Mã vai trò RBAC (bảng `user_roles`). Một người có thể mang nhiều vai trò. */
  roles: string[];
  type?: 'access';
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;
  username: string;
  jti?: string;
  type: 'refresh';
  iat: number;
  exp: number;
}

const DEFAULT_TTL_SECONDS = 8 * 60 * 60;
const DEFAULT_REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class AuthTokenService {
  private readonly logger = new Logger(AuthTokenService.name);
  private readonly secret: string;

  constructor(private readonly config: ConfigService) {
    this.secret = this.resolveSecret();
  }

  sign(payload: Omit<AuthTokenPayload, 'iat' | 'exp' | 'type'>): { accessToken: string; expiresIn: number } {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = this.resolveTtlSeconds();
    const fullPayload: AuthTokenPayload = { ...payload, type: 'access', iat: now, exp: now + expiresIn };
    const body = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const signature = this.signature(body);
    return { accessToken: `${body}.${signature}`, expiresIn };
  }

  signRefreshToken(payload: { sub: string; username: string }): { refreshToken: string; expiresIn: number } {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = this.resolveRefreshTtlSeconds();
    const fullPayload: RefreshTokenPayload = {
      ...payload,
      jti: randomUUID(),
      type: 'refresh',
      iat: now,
      exp: now + expiresIn,
    };
    const body = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const signature = this.signature(body);
    return { refreshToken: `${body}.${signature}`, expiresIn };
  }

  verify(token: string): AuthTokenPayload {
    const parts = token.split('.');
    if (parts.length !== 2) throw appUnauthorized('auth.invalidToken');
    const [body, signature] = parts;
    if (!body || !signature) throw appUnauthorized('auth.invalidToken');
    if (!this.matchesSignature(body, signature)) throw appUnauthorized('auth.invalidToken');

    const payload = this.decodePayload(body);
    if ((payload as unknown as RefreshTokenPayload).type === 'refresh') {
      throw appUnauthorized('auth.invalidToken');
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) throw appUnauthorized('auth.expiredToken');
    return payload;
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    const parts = token.split('.');
    if (parts.length !== 2) throw appUnauthorized('auth.invalidToken');
    const [body, signature] = parts;
    if (!body || !signature) throw appUnauthorized('auth.invalidToken');
    if (!this.matchesSignature(body, signature)) throw appUnauthorized('auth.invalidToken');

    const payload = this.decodeRefreshPayload(body);
    if (payload.type !== 'refresh') throw appUnauthorized('auth.invalidToken');
    if (payload.exp < Math.floor(Date.now() / 1000)) throw appUnauthorized('auth.expiredToken');
    return payload;
  }

  private decodePayload(body: string): AuthTokenPayload {
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AuthTokenPayload;
      if (!payload || typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
        throw new Error('payload thiếu trường bắt buộc');
      }
      return payload;
    } catch {
      throw appUnauthorized('auth.invalidToken');
    }
  }

  private decodeRefreshPayload(body: string): RefreshTokenPayload {
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as RefreshTokenPayload;
      if (!payload || typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
        throw new Error('payload thiếu trường bắt buộc');
      }
      return payload;
    } catch {
      throw appUnauthorized('auth.invalidToken');
    }
  }

  /** So sánh chống timing attack; khác độ dài thì trả false thay vì để timingSafeEqual ném RangeError. */
  private matchesSignature(body: string, signature: string): boolean {
    const actual = Buffer.from(signature);
    const expected = Buffer.from(this.signature(body));
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  }

  private signature(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }

  private resolveTtlSeconds(): number {
    const configured = Number(this.config.get<string | number>('AUTH_TOKEN_TTL_SECONDS'));
    return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_TTL_SECONDS;
  }

  private resolveRefreshTtlSeconds(): number {
    const configured = Number(this.config.get<string | number>('AUTH_REFRESH_TOKEN_TTL_SECONDS'));
    return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_REFRESH_TTL_SECONDS;
  }

  private resolveSecret(): string {
    const configured = this.config.get<string>('AUTH_TOKEN_SECRET')?.trim();
    if (configured) return configured;

    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new Error('Thiếu biến môi trường AUTH_TOKEN_SECRET. Không thể khởi động API ở môi trường production.');
    }

    this.logger.warn(
      'Chưa cấu hình AUTH_TOKEN_SECRET. Đang dùng secret ngẫu nhiên sinh khi khởi động: token sẽ mất hiệu lực sau mỗi lần khởi động lại. Hãy đặt AUTH_TOKEN_SECRET trong tệp .env.',
    );
    return randomBytes(48).toString('hex');
  }
}
