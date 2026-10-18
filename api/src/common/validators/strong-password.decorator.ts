import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Chính sách mật khẩu dùng chung — NGUỒN SỰ THẬT ở tầng API.
 *
 * Mọi nơi người dùng ĐẶT mật khẩu (đăng ký F00, admin tạo/đổi tài khoản, tự đổi mật khẩu) phải
 * dùng decorator này để ràng buộc như nhau, thay vì mỗi DTO tự khai `MinLength(6)` một kiểu.
 *
 * Yêu cầu: 8–72 ký tự, có ít nhất một chữ hoa, một chữ thường, một chữ số và một ký tự đặc biệt.
 * (Trần 72 theo giới hạn an toàn của thuật toán băm; đủ rộng cho mọi mật khẩu thực tế.)
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export function IsStrongPassword(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH, { message: 'Mật khẩu tối thiểu 8 ký tự.' }),
    MaxLength(PASSWORD_MAX_LENGTH, { message: 'Mật khẩu tối đa 72 ký tự.' }),
    Matches(/[A-Z]/, { message: 'Mật khẩu phải có ít nhất một chữ hoa.' }),
    Matches(/[a-z]/, { message: 'Mật khẩu phải có ít nhất một chữ thường.' }),
    Matches(/\d/, { message: 'Mật khẩu phải có ít nhất một chữ số.' }),
    Matches(/[^A-Za-z0-9]/, { message: 'Mật khẩu phải có ít nhất một ký tự đặc biệt.' }),
  );
}
