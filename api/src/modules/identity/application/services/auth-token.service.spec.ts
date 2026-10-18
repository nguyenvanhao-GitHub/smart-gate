import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { AuthTokenService } from './auth-token.service';

/** ConfigService giả lập, chỉ trả các biến môi trường được nạp sẵn. */
function configStub(values: Record<string, string | number | undefined>): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) => (values[key] !== undefined ? values[key] : defaultValue),
  } as unknown as ConfigService;
}

const SECRET = 'secret-danh-cho-kiem-thu';
const SUBJECT = { sub: 'user-1', username: 'admin', roles: ['SYS_ADMIN', 'MANAGEMENT'] };

describe('AuthTokenService', () => {
  describe('secret', () => {
    it('ném lỗi khi thiếu AUTH_TOKEN_SECRET ở môi trường production', () => {
      expect(() => new AuthTokenService(configStub({ NODE_ENV: 'production' }))).toThrow(/AUTH_TOKEN_SECRET/);
    });

    it('vẫn khởi tạo được ở môi trường development khi thiếu AUTH_TOKEN_SECRET', () => {
      expect(() => new AuthTokenService(configStub({ NODE_ENV: 'development' }))).not.toThrow();
    });

    it('không dùng secret cố định trong mã nguồn: 2 lần khởi tạo cho ra chữ ký khác nhau', () => {
      const first = new AuthTokenService(configStub({ NODE_ENV: 'development' }));
      const second = new AuthTokenService(configStub({ NODE_ENV: 'development' }));

      expect(() => second.verify(first.sign(SUBJECT).accessToken)).toThrow(UnauthorizedException);
    });
  });

  describe('sign', () => {
    it('trả token verify được và giữ nguyên thông tin actor', () => {
      const service = new AuthTokenService(configStub({ AUTH_TOKEN_SECRET: SECRET }));
      const { accessToken, expiresIn } = service.sign(SUBJECT);
      const payload = service.verify(accessToken);

      expect(expiresIn).toBe(8 * 60 * 60);
      expect(payload.sub).toBe(SUBJECT.sub);
      expect(payload.username).toBe(SUBJECT.username);
      // Token phải mang đủ danh sách vai trò RBAC để dựng ảnh chụp kiểm toán ở phía use-case.
      expect(payload.roles).toEqual(SUBJECT.roles);
      expect(payload.exp).toBe(payload.iat + expiresIn);
    });

    it('đọc AUTH_TOKEN_TTL_SECONDS dạng chuỗi thành số', () => {
      const service = new AuthTokenService(configStub({ AUTH_TOKEN_SECRET: SECRET, AUTH_TOKEN_TTL_SECONDS: '28800' }));
      const { accessToken, expiresIn } = service.sign(SUBJECT);
      const payload = service.verify(accessToken);

      expect(expiresIn).toBe(28800);
      expect(payload.exp - payload.iat).toBe(28800);
    });
  });

  describe('verify', () => {
    const service = new AuthTokenService(configStub({ AUTH_TOKEN_SECRET: SECRET }));

    it('ném UnauthorizedException khi chữ ký bị sửa nhưng giữ nguyên độ dài', () => {
      const [body, signature] = service.sign(SUBJECT).accessToken.split('.');
      const tampered = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;

      expect(tampered).toHaveLength(signature.length);
      expect(() => service.verify(`${body}.${tampered}`)).toThrow(UnauthorizedException);
    });

    it('ném UnauthorizedException khi chữ ký sai độ dài (không phải RangeError/500)', () => {
      const [body] = service.sign(SUBJECT).accessToken.split('.');

      expect(() => service.verify(`${body}.abc`)).toThrow(UnauthorizedException);
    });

    it('ném UnauthorizedException khi phần payload bị sửa', () => {
      const [, signature] = service.sign(SUBJECT).accessToken.split('.');
      const forgedBody = Buffer.from(
        JSON.stringify({ ...SUBJECT, iat: 0, exp: 9_999_999_999 }),
      ).toString('base64url');

      expect(() => service.verify(`${forgedBody}.${signature}`)).toThrow(UnauthorizedException);
    });

    it.each([
      ['chuỗi rỗng', ''],
      ['không có dấu chấm', 'khong-phai-token'],
      ['ba phần kiểu JWT', 'a.b.c'],
      ['thiếu chữ ký', 'body.'],
    ])('ném UnauthorizedException với token dị dạng: %s', (_label, token) => {
      expect(() => service.verify(token)).toThrow(UnauthorizedException);
    });

    it('ném UnauthorizedException khi token hết hạn', () => {
      const expiring = new AuthTokenService(configStub({ AUTH_TOKEN_SECRET: SECRET, AUTH_TOKEN_TTL_SECONDS: '1' }));
      const { accessToken } = expiring.sign(SUBJECT);

      const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000);
      try {
        expect(() => expiring.verify(accessToken)).toThrow(UnauthorizedException);
      } finally {
        clock.mockRestore();
      }
    });

    it('ném UnauthorizedException khi payload ký đúng nhưng không phải JSON hợp lệ', () => {
      // Ký phần body rác bằng đúng secret để đi qua được bước kiểm chữ ký.
      const body = Buffer.from('day-khong-phai-json').toString('base64url');
      const signature = createHmac('sha256', SECRET).update(body).digest('base64url');

      expect(() => service.verify(`${body}.${signature}`)).toThrow(UnauthorizedException);
    });

    it('từ chối khi dùng Refresh Token làm Access Token', () => {
      const { refreshToken } = service.signRefreshToken({ sub: SUBJECT.sub, username: SUBJECT.username });
      expect(() => service.verify(refreshToken)).toThrow(UnauthorizedException);
    });
  });

  describe('signRefreshToken & verifyRefreshToken', () => {
    const service = new AuthTokenService(configStub({ AUTH_TOKEN_SECRET: SECRET }));

    it('sinh refresh token và xác thực thành công thông tin user', () => {
      const { refreshToken, expiresIn } = service.signRefreshToken({ sub: SUBJECT.sub, username: SUBJECT.username });
      expect(expiresIn).toBe(7 * 24 * 60 * 60);

      const payload = service.verifyRefreshToken(refreshToken);
      expect(payload.sub).toBe(SUBJECT.sub);
      expect(payload.username).toBe(SUBJECT.username);
      expect(payload.type).toBe('refresh');
    });

    it('đọc cấu hình AUTH_REFRESH_TOKEN_TTL_SECONDS', () => {
      const custom = new AuthTokenService(
        configStub({ AUTH_TOKEN_SECRET: SECRET, AUTH_REFRESH_TOKEN_TTL_SECONDS: '3600' }),
      );
      const { expiresIn } = custom.signRefreshToken({ sub: SUBJECT.sub, username: SUBJECT.username });
      expect(expiresIn).toBe(3600);
    });

    it('từ chối Access Token khi đưa vào verifyRefreshToken', () => {
      const { accessToken } = service.sign(SUBJECT);
      expect(() => service.verifyRefreshToken(accessToken)).toThrow(UnauthorizedException);
    });

    it('từ chối Refresh Token khi đã hết hạn', () => {
      const expiring = new AuthTokenService(
        configStub({ AUTH_TOKEN_SECRET: SECRET, AUTH_REFRESH_TOKEN_TTL_SECONDS: '1' }),
      );
      const { refreshToken } = expiring.signRefreshToken({ sub: SUBJECT.sub, username: SUBJECT.username });

      const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000);
      try {
        expect(() => expiring.verifyRefreshToken(refreshToken)).toThrow(UnauthorizedException);
      } finally {
        clock.mockRestore();
      }
    });
  });
});
