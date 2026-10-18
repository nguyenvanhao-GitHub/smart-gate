// `class-transformer` đọc metadata của decorator nên phải nạp reflect-metadata trước.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateFeeRuleRequest, FeeExportRequest, FeeWorkbenchActionRequest } from './fee.request';

/**
 * `ValidationPipe` bật `whitelist + transform + forbidNonWhitelisted` nên DTO là nơi duy nhất quyết
 * định request được nhận hay bị 400.
 *
 * BUG-029 — thao tác điều chỉnh/bổ sung/hủy/gộp trên màn `/fees/:slug` **bắt buộc có lý do/ghi chú**:
 * trước đây thân yêu cầu không có DTO nên bỏ trống vẫn lưu.
 */
describe('FeeWorkbenchActionRequest (BUG-029)', () => {
  const REQUIRED_MESSAGE = 'Vui lòng nhập lý do/ghi chú cho thao tác điều chỉnh phí.';

  it('thiếu lý do (không gửi note) bị chặn kèm thông báo tiếng Việt', () => {
    const dto = plainToInstance(FeeWorkbenchActionRequest, {
      declarationId: '11111111-1111-4111-8111-111111111111',
      amount: 250000,
    });
    const errors = validateSync(dto);

    const noteError = errors.find((error) => error.property === 'note');
    expect(noteError).toBeDefined();
    expect(Object.values(noteError?.constraints ?? {})).toContain(REQUIRED_MESSAGE);
  });

  it('lý do chỉ có khoảng trắng bị coi là bỏ trống (trim rồi mới kiểm)', () => {
    const dto = plainToInstance(FeeWorkbenchActionRequest, { note: '    ' });
    const errors = validateSync(dto);

    expect(errors.some((error) => error.property === 'note')).toBe(true);
  });

  it('có lý do hợp lệ thì qua', () => {
    const dto = plainToInstance(FeeWorkbenchActionRequest, {
      declarationId: '11111111-1111-4111-8111-111111111111',
      amount: 250000,
      note: 'Bổ sung do đổi xe',
    });

    expect(validateSync(dto)).toEqual([]);
    expect(dto.note).toBe('Bổ sung do đổi xe');
  });
});

describe('FeeExportRequest (BUG-028)', () => {
  it('bỏ qua ô lọc rỗng, không phải 400', () => {
    const dto = plainToInstance(FeeExportRequest, { keyword: '', feeType: '', from: '', to: '' });
    expect(validateSync(dto)).toEqual([]);
  });

  it('nhận bộ lọc trạng thái hợp lệ và khoảng ngày YYYY-MM-DD', () => {
    const dto = plainToInstance(FeeExportRequest, {
      keyword: '29A-12345',
      status: 'OVERDUE',
      feeType: 'TAX',
      from: '2026-08-01',
      to: '2026-08-02',
    });
    expect(validateSync(dto)).toEqual([]);
  });

  it('trạng thái lạ bị chặn kèm thông báo tiếng Việt', () => {
    const errors = validateSync(plainToInstance(FeeExportRequest, { status: 'KHONG_HOP_LE' }));
    expect(errors[0].constraints?.isIn).toBe('Bộ lọc trạng thái không hợp lệ.');
  });
});

describe('CreateFeeRuleRequest (F46)', () => {
  it('nhận payload chứa cả VEHICLE_TYPE và DeclarationType trong appliesTo', () => {
    const payload = {
      code: 'TESTING',
      name: 'TESTING',
      feeType: 'INFRASTRUCTURE',
      unit: 'TRIP',
      amount: 500000,
      currency: 'VND',
      appliesTo: ['TRUCK', 'CONTAINER', 'EXPORT', 'IMPORT'],
      effectiveFrom: '2026-08-11',
    };
    const dto = plainToInstance(CreateFeeRuleRequest, payload);
    const errors = validateSync(dto);
    expect(errors).toEqual([]);
  });
});
