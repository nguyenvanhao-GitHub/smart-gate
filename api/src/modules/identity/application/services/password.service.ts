import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/** Tham số scrypt: bộ nhớ cần 128 * N * r = 16 MB, đủ chậm để chống brute-force theo NFR-06. */
const SCRYPT_ALGORITHM = 'scrypt';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
/** 32 byte cho chuỗi kết quả dài 115 ký tự, vừa cột users.passwordHash varchar(128) — đổi tham số phải kiểm lại độ dài này. */
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export interface PasswordVerifyResult {
  /** Mật khẩu khớp hay không. */
  valid: boolean;
  /** True khi hash đang lưu ở định dạng cũ (SHA-256) và cần băm lại bằng scrypt. */
  needsRehash: boolean;
}

@Injectable()
export class PasswordService {
  /** Sinh hash định dạng `scrypt$N$r$p$<salt-hex>$<hash-hex>`. */
  hash(plainText: string): string {
    const salt = randomBytes(16);
    const derived = this.deriveScrypt(plainText, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
    return [
      SCRYPT_ALGORITHM,
      SCRYPT_N,
      SCRYPT_R,
      SCRYPT_P,
      salt.toString('hex'),
      derived.toString('hex'),
    ].join('$');
  }

  verify(plainText: string, storedHash: string): boolean {
    return this.verifyDetailed(plainText, storedHash).valid;
  }

  /** Như verify() nhưng báo thêm việc cần nâng cấp hash cũ sang scrypt. */
  verifyDetailed(plainText: string, storedHash: string): PasswordVerifyResult {
    if (!storedHash) return { valid: false, needsRehash: false };
    if (storedHash.startsWith(`${SCRYPT_ALGORITHM}$`)) {
      return { valid: this.verifyScrypt(plainText, storedHash), needsRehash: false };
    }
    const validLegacy = this.verifyLegacySha256(plainText, storedHash);
    return { valid: validLegacy, needsRehash: validLegacy };
  }

  private verifyScrypt(plainText: string, storedHash: string): boolean {
    const [, rawN, rawR, rawP, saltHex, expectedHex] = storedHash.split('$');
    const n = Number(rawN);
    const r = Number(rawR);
    const p = Number(rawP);
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || !saltHex || !expectedHex) {
      return false;
    }

    const expected = Buffer.from(expectedHex, 'hex');
    if (expected.length === 0) return false;

    try {
      const actual = this.deriveScrypt(plainText, Buffer.from(saltHex, 'hex'), n, r, p, expected.length);
      return this.safeEqual(actual, expected);
    } catch {
      return false;
    }
  }

  /** Định dạng cũ `<salt>:<sha256hex>` — giữ để tài khoản đã tạo trước đây vẫn đăng nhập được. */
  private verifyLegacySha256(plainText: string, storedHash: string): boolean {
    const [salt, expected] = storedHash.split(':');
    if (!salt || !expected) return false;
    const actual = createHash('sha256').update(`${salt}:${plainText}`).digest('hex');
    return this.safeEqual(Buffer.from(actual), Buffer.from(expected));
  }

  private deriveScrypt(
    plainText: string,
    salt: Buffer,
    n: number,
    r: number,
    p: number,
    keyLength: number = SCRYPT_KEY_LENGTH,
  ): Buffer {
    return scryptSync(plainText, salt, keyLength, { N: n, r, p, maxmem: SCRYPT_MAXMEM });
  }

  /** timingSafeEqual ném RangeError khi 2 buffer khác độ dài — phải chặn trước. */
  private safeEqual(actual: Buffer, expected: Buffer): boolean {
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  }
}
