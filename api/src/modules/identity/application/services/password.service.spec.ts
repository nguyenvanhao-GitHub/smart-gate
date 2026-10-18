import { createHash, randomBytes } from 'crypto';
import { PasswordService } from './password.service';

/** Sinh hash theo định dạng cũ `<salt>:<sha256hex>` để kiểm tra tương thích ngược. */
function legacyHash(plainText: string, salt = randomBytes(16).toString('hex')): string {
  return `${salt}:${createHash('sha256').update(`${salt}:${plainText}`).digest('hex')}`;
}

describe('PasswordService', () => {
  const service = new PasswordService();

  describe('hash', () => {
    it('sinh hash theo định dạng scrypt$N$r$p$salt$hash', () => {
      const hash = service.hash('123456');
      const parts = hash.split('$');

      expect(parts).toHaveLength(6);
      expect(parts[0]).toBe('scrypt');
      expect(Number(parts[1])).toBeGreaterThan(0);
      expect(hash).not.toContain(':');
    });

    it('không dùng lại salt giữa 2 lần băm cùng một mật khẩu', () => {
      expect(service.hash('123456')).not.toBe(service.hash('123456'));
    });

    it('sinh chuỗi vừa cột users.passwordHash varchar(128)', () => {
      expect(service.hash('123456').length).toBeLessThanOrEqual(128);
    });
  });

  describe('verify với hash scrypt', () => {
    it('trả true khi mật khẩu đúng', () => {
      expect(service.verify('123456', service.hash('123456'))).toBe(true);
    });

    it('trả false khi mật khẩu sai', () => {
      expect(service.verify('654321', service.hash('123456'))).toBe(false);
    });

    it('không cần băm lại khi hash đã ở định dạng scrypt', () => {
      expect(service.verifyDetailed('123456', service.hash('123456'))).toEqual({ valid: true, needsRehash: false });
    });
  });

  describe('verify với hash cũ SHA-256', () => {
    it('vẫn đăng nhập được và báo cần băm lại', () => {
      expect(service.verifyDetailed('123456', legacyHash('123456'))).toEqual({ valid: true, needsRehash: true });
    });

    it('trả false khi mật khẩu sai, và không yêu cầu băm lại', () => {
      expect(service.verifyDetailed('sai-mat-khau', legacyHash('123456'))).toEqual({
        valid: false,
        needsRehash: false,
      });
    });
  });

  describe('không được ném exception với dữ liệu hỏng (S3)', () => {
    const brokenHashes: Array<[string, string]> = [
      ['hash rỗng', ''],
      ['hash cũ sai độ dài phần digest', 'abc123:0011'],
      ['hash cũ thiếu digest', 'chi-co-salt'],
      ['hash scrypt sai độ dài phần digest', 'scrypt$16384$8$1$aabbccdd$00ff'],
      ['hash scrypt thiếu thành phần', 'scrypt$16384$8'],
      ['hash scrypt tham số không phải số', 'scrypt$abc$def$ghi$aabbccdd$00ff'],
      ['chuỗi rác', 'khong-phai-hash'],
    ];

    it.each(brokenHashes)('%s → trả false chứ không ném RangeError', (_label, storedHash) => {
      expect(() => service.verify('123456', storedHash)).not.toThrow();
      expect(service.verify('123456', storedHash)).toBe(false);
    });
  });
});
