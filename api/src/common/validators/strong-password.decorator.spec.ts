// `class-validator` đọc metadata của decorator nên phải nạp reflect-metadata trước.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AccountType } from '../../modules/identity/domain/user.entity';
import { CreateUserRequest } from '../../modules/identity/presentation/http/dto/create-user.request';
import { RegisterRequest } from '../../modules/identity/presentation/http/dto/register.request';

/**
 * BUG-010 — chính sách mật khẩu là ràng buộc ở API (nguồn sự thật), không chỉ hint ở web.
 * `ValidationPipe` bật `whitelist + transform + forbidNonWhitelisted`, nên DTO quyết định 400.
 * Mật khẩu phải ≥ 8 ký tự và có đủ chữ hoa + chữ thường + chữ số + ký tự đặc biệt.
 */

function baseRegister(password: string): Record<string, unknown> {
  return {
    accountType: AccountType.ENTERPRISE,
    username: 'doanhnghiep.a',
    password,
    displayName: 'Công ty A',
    address: 'Số 1, đường A',
    email: 'a@example.com',
    phone: '0912345678',
    taxCode: '0101234567',
    representativeName: 'Nguyễn Văn A',
  };
}

function passwordErrors(dto: object): string[] {
  const error = validateSync(dto).find((item) => item.property === 'password');
  return Object.values(error?.constraints ?? {});
}

describe('Chính sách mật khẩu dùng chung (IsStrongPassword)', () => {
  describe('RegisterRequest', () => {
    it('mật khẩu đủ mạnh → không lỗi trường password', () => {
      const dto = plainToInstance(RegisterRequest, baseRegister('MatKhau@123'));
      expect(passwordErrors(dto)).toEqual([]);
    });

    it('quá ngắn (< 8) → bị chặn kèm thông báo tiếng Việt có dấu', () => {
      const dto = plainToInstance(RegisterRequest, baseRegister('Ab@1'));
      expect(passwordErrors(dto)).toContain('Mật khẩu tối thiểu 8 ký tự.');
    });

    it('thiếu chữ hoa → bị chặn', () => {
      const dto = plainToInstance(RegisterRequest, baseRegister('matkhau@123'));
      expect(passwordErrors(dto)).toContain('Mật khẩu phải có ít nhất một chữ hoa.');
    });

    it('thiếu chữ thường → bị chặn', () => {
      const dto = plainToInstance(RegisterRequest, baseRegister('MATKHAU@123'));
      expect(passwordErrors(dto)).toContain('Mật khẩu phải có ít nhất một chữ thường.');
    });

    it('thiếu chữ số → bị chặn', () => {
      const dto = plainToInstance(RegisterRequest, baseRegister('MatKhau@abc'));
      expect(passwordErrors(dto)).toContain('Mật khẩu phải có ít nhất một chữ số.');
    });

    it('thiếu ký tự đặc biệt → bị chặn', () => {
      const dto = plainToInstance(RegisterRequest, baseRegister('MatKhau123'));
      expect(passwordErrors(dto)).toContain('Mật khẩu phải có ít nhất một ký tự đặc biệt.');
    });
  });

  describe('CreateUserRequest (admin tạo tài khoản)', () => {
    it('mật khẩu đủ mạnh → không lỗi trường password', () => {
      const dto = plainToInstance(CreateUserRequest, {
        username: 'canbo.a',
        password: 'MatKhau@123',
        displayName: 'Cán bộ A',
        title: 'Chuyên viên',
      });
      expect(passwordErrors(dto)).toEqual([]);
    });

    it('mật khẩu yếu (chỉ chữ thường + số) → bị chặn', () => {
      const dto = plainToInstance(CreateUserRequest, {
        username: 'canbo.a',
        password: 'matkhau123',
        displayName: 'Cán bộ A',
        title: 'Chuyên viên',
      });
      // Nhiều @Matches dùng chung khóa `matches` nên chỉ một thông báo còn lại; điều cốt lõi là
      // trường password bị chặn với thông báo tiếng Việt có dấu.
      const errors = passwordErrors(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.every((message) => message.startsWith('Mật khẩu'))).toBe(true);
    });

    it('thiếu duy nhất chữ hoa → chặn với đúng thông báo chữ hoa', () => {
      const dto = plainToInstance(CreateUserRequest, {
        username: 'canbo.a',
        password: 'matkhau@123',
        displayName: 'Cán bộ A',
        title: 'Chuyên viên',
      });
      expect(passwordErrors(dto)).toContain('Mật khẩu phải có ít nhất một chữ hoa.');
    });
  });
});
