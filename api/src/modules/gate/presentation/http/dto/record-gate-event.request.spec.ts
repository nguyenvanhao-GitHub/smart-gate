// `class-transformer` đọc metadata của decorator nên phải nạp reflect-metadata trước.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { GateDecision } from '../../../domain/gate-event.entity';
import { RecordGateEventRequest } from './record-gate-event.request';

const DOSSIER_ID = '11111111-1111-4111-8111-111111111111';

/**
 * `ValidationPipe` của dự án bật `whitelist + transform + forbidNonWhitelisted`, nên DTO là nơi
 * duy nhất quyết định request được nhận hay bị 400.
 *
 * BUG-021 — TỪ CHỐI cho qua cổng (DENY) BẮT BUỘC nêu lý do. Ràng buộc này phải nằm ở API, không chỉ
 * ở web: gọi thẳng endpoint mà thiếu lý do vẫn bị chặn 400 kèm thông báo tiếng Việt có dấu.
 */
describe('RecordGateEventRequest — DTO ghi nhận sự kiện cổng', () => {
  it('CHO QUA (ALLOW) không cần ghi chú → hợp lệ', () => {
    const dto = plainToInstance(RecordGateEventRequest, {
      dossierId: DOSSIER_ID,
      gateCode: 'B1',
      decision: GateDecision.ALLOW,
    });

    expect(validateSync(dto)).toEqual([]);
  });

  it('TỪ CHỐI (DENY) mà THIẾU lý do → bị chặn kèm thông báo tiếng Việt có dấu', () => {
    const dto = plainToInstance(RecordGateEventRequest, {
      dossierId: DOSSIER_ID,
      gateCode: 'B1',
      decision: GateDecision.DENY,
    });
    const errors = validateSync(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('note');
    expect(errors[0].constraints?.isNotEmpty).toBe('Vui lòng nhập lý do khi từ chối cho qua cổng.');
  });

  it('TỪ CHỐI (DENY) mà lý do rỗng/khoảng trắng vẫn bị chặn', () => {
    const errors = validateSync(
      plainToInstance(RecordGateEventRequest, { dossierId: DOSSIER_ID, gateCode: 'B1', decision: GateDecision.DENY, note: '' }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.isNotEmpty).toBe('Vui lòng nhập lý do khi từ chối cho qua cổng.');
  });

  it('TỪ CHỐI (DENY) kèm lý do → hợp lệ', () => {
    const dto = plainToInstance(RecordGateEventRequest, {
      dossierId: DOSSIER_ID,
      gateCode: 'B1',
      decision: GateDecision.DENY,
      note: 'Thiếu chứng thư kiểm dịch thực vật.',
    });

    expect(validateSync(dto)).toEqual([]);
  });

  it('ghi chú vượt 500 ký tự vẫn bị chặn dù là CHO QUA', () => {
    const errors = validateSync(
      plainToInstance(RecordGateEventRequest, {
        dossierId: DOSSIER_ID,
        gateCode: 'B1',
        decision: GateDecision.ALLOW,
        note: 'x'.repeat(501),
      }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.maxLength).toBe('Ghi chú tối đa 500 ký tự.');
  });
});
