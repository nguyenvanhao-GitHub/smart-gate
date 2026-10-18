// `class-transformer` đọc metadata của decorator nên phải nạp reflect-metadata trước.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CheckpointCode, DeclarationStatus } from '../../../../declarations/domain/declaration.enums';
import { DashboardOverviewRequest } from './dashboard-overview.request';
import { ReportQueryRequest } from './report-query.request';

/**
 * `ValidationPipe` của dự án bật `whitelist + transform + forbidNonWhitelisted`, nên DTO là nơi
 * duy nhất quyết định request được nhận hay bị 400. Hai điều dễ hỏng và được khoá lại ở đây:
 * ô lọc bỏ trống (giao diện gửi chuỗi rỗng) và giá trị sai (phải báo lỗi tiếng Việt).
 */
describe('DTO bộ lọc báo cáo và dashboard', () => {
  it('ô lọc bỏ trống được hiểu là "không lọc", không phải 400', () => {
    const dto = plainToInstance(ReportQueryRequest, { from: '', to: '  ', checkpoint: '', type: '', status: '', agencyCode: '' });

    expect(validateSync(dto)).toEqual([]);
    expect(dto.from).toBeUndefined();
    expect(dto.checkpoint).toBeUndefined();
    expect(dto.status).toBeUndefined();
  });

  it('giữ nguyên giá trị hợp lệ', () => {
    const dto = plainToInstance(ReportQueryRequest, {
      from: '2026-07-01',
      checkpoint: CheckpointCode.B1,
      status: DeclarationStatus.COMPLETED,
      pageSize: 50,
    });

    expect(validateSync(dto)).toEqual([]);
    expect(dto).toMatchObject({ from: '2026-07-01', checkpoint: 'B1', status: 'COMPLETED', pageSize: 50 });
  });

  it('giá trị sai bị chặn kèm thông báo tiếng Việt có dấu', () => {
    const dto = plainToInstance(ReportQueryRequest, { status: 'KHONG_CO_TRANG_THAI_NAY' });
    const errors = validateSync(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.isEnum).toBe('Trạng thái hồ sơ không hợp lệ.');
  });

  it('chặn pageSize vượt trần để một lần gọi không kéo cả kho dữ liệu', () => {
    const errors = validateSync(plainToInstance(ReportQueryRequest, { pageSize: 5000 }));

    expect(errors[0].constraints?.max).toBe('Tham số pageSize tối đa là 100.');
  });

  it('dashboard cũng bỏ qua ô lọc rỗng', () => {
    const dto = plainToInstance(DashboardOverviewRequest, { checkpoint: '', from: '', to: '' });

    expect(validateSync(dto)).toEqual([]);
    expect(dto).toEqual({ checkpoint: undefined, from: undefined, to: undefined });
  });
});
