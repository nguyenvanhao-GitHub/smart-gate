// `class-transformer` đọc metadata của decorator nên phải nạp reflect-metadata trước.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateProfileRequest } from './update-profile.request';

/**
 * `ValidationPipe` của dự án bật `whitelist + transform + forbidNonWhitelisted`, nên DTO là nơi
 * duy nhất quyết định request được nhận hay bị 400.
 *
 * BUG-037 — Email (F01) là định danh liên hệ BẮT BUỘC: không cho "xóa trắng". Nếu có gửi thì phải
 * hợp lệ và không được rỗng; ràng buộc nằm ở API, không chỉ ở web.
 */
describe('UpdateProfileRequest — DTO cập nhật hồ sơ cá nhân', () => {
  it('email hợp lệ kèm các trường khác → hợp lệ', () => {
    const dto = plainToInstance(UpdateProfileRequest, {
      displayName: 'Nguyễn Văn A',
      email: 'nguyenvana@chc.gov.vn',
      phone: '0900000001',
    });

    expect(validateSync(dto)).toEqual([]);
  });

  it('email RỖNG → bị chặn kèm thông báo tiếng Việt có dấu', () => {
    const errors = validateSync(plainToInstance(UpdateProfileRequest, { email: '' }));

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('email');
    expect(errors[0].constraints?.isNotEmpty).toBe('Thư điện tử không được để trống.');
  });

  it('email chỉ toàn khoảng trắng (trim → rỗng) vẫn bị chặn', () => {
    const errors = validateSync(plainToInstance(UpdateProfileRequest, { email: '   ' }));

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.isNotEmpty).toBe('Thư điện tử không được để trống.');
  });

  it('email sai định dạng → bị chặn kèm thông báo email không hợp lệ', () => {
    const errors = validateSync(plainToInstance(UpdateProfileRequest, { email: 'khong-phai-email' }));

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.isEmail).toBe('Địa chỉ email không hợp lệ.');
  });

  it('không gửi email (chỉ cập nhật trường khác) → hợp lệ, không đụng email', () => {
    const dto = plainToInstance(UpdateProfileRequest, { displayName: 'Nguyễn Văn B', representativeName: 'Trần Đại Diện' });

    expect(validateSync(dto)).toEqual([]);
    expect(dto.email).toBeUndefined();
    expect(dto.representativeName).toBe('Trần Đại Diện');
  });
});
