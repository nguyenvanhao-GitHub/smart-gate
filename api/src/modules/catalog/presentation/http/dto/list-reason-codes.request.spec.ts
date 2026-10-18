// `class-transformer` đọc metadata của decorator nên phải nạp reflect-metadata trước.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ReasonScope } from '../../../domain/reason-code.catalog';
import { ListReasonCodesRequest } from './list-reason-codes.request';

/**
 * `ValidationPipe` của dự án bật `whitelist + transform + forbidNonWhitelisted`, nên DTO là nơi
 * duy nhất quyết định `GET /catalog/reason-codes?scope=...` được nhận hay bị 400.
 *
 * Nhóm "thu hồi xác nhận" (REVOKE) đã bị gỡ cùng quyết định REVOKE và danh mục `REASON_REVOKE`.
 * Đây khóa lại: `scope` chỉ còn 3 tình huống hợp đồng (SUPPLEMENT / REJECT / FEE_ADJUST); mọi giá trị
 * ngoài tập đóng — kể cả `REVOKE` cũ — bị chặn ở API kèm thông báo tiếng Việt có dấu, không rơi mặc định.
 */
describe('ListReasonCodesRequest — DTO tham số scope của reason-codes', () => {
  it.each([ReasonScope.SUPPLEMENT, ReasonScope.REJECT, ReasonScope.FEE_ADJUST])(
    'scope hợp lệ %s → không lỗi',
    (scope) => {
      const dto = plainToInstance(ListReasonCodesRequest, { scope });

      expect(validateSync(dto)).toEqual([]);
    },
  );

  it('bỏ trống scope (tùy chọn) → hợp lệ', () => {
    expect(validateSync(plainToInstance(ListReasonCodesRequest, {}))).toEqual([]);
  });

  it('scope=REVOKE (đã gỡ khỏi enum) → bị chặn kèm thông báo tiếng Việt có dấu', () => {
    const errors = validateSync(plainToInstance(ListReasonCodesRequest, { scope: 'REVOKE' }));

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('scope');
    expect(errors[0].constraints?.isEnum).toBe(
      'Tham số scope chỉ nhận SUPPLEMENT, REJECT hoặc FEE_ADJUST.',
    );
  });

  it('REVOKE không còn là thành viên của enum ReasonScope', () => {
    expect(Object.values(ReasonScope)).not.toContain('REVOKE');
    expect((ReasonScope as Record<string, string>).REVOKE).toBeUndefined();
  });

  it('scope là mã lạ ngoài tập đóng → bị chặn', () => {
    const errors = validateSync(plainToInstance(ListReasonCodesRequest, { scope: 'FOO' }));

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.isEnum).toBeDefined();
  });
});
