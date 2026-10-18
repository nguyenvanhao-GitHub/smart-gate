import { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { appBadRequest, appConflict } from '../i18n';
import { AppExceptionFilter } from './app-exception.filter';

interface Captured {
  status: number;
  body: Record<string, unknown>;
}

function runFilter(exception: unknown, acceptLanguage?: string): Captured {
  const captured: Captured = { status: 0, body: {} };
  const response = {
    headersSent: false,
    status(code: number) {
      captured.status = code;
      return {
        json(body: Record<string, unknown>) {
          captured.body = body;
        },
      };
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: acceptLanguage ? { 'accept-language': acceptLanguage } : {} }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  const filter = new AppExceptionFilter();
  // Mock logger to avoid polluting test output with simulated errors
  (filter as any).logger = { error: jest.fn() };
  filter.catch(exception, host);
  return captured;
}

describe('AppExceptionFilter', () => {
  it('không gửi Accept-Language → thông báo tiếng Việt kèm khóa và tham số', () => {
    const { status, body } = runFilter(appBadRequest('file.tooLarge', { max: 20 }));

    expect(status).toBe(400);
    expect(body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Tệp vượt quá dung lượng cho phép (tối đa 20 MB).',
      messageKey: 'file.tooLarge',
      messageParams: { max: 20 },
    });
  });

  it('Accept-Language: en → thông báo tiếng Anh, khóa và tham số giữ nguyên', () => {
    const { body } = runFilter(appBadRequest('file.tooLarge', { max: 20 }), 'en-US,en;q=0.9');

    expect(body['message']).toBe('The file exceeds the allowed size (max 20 MB).');
    expect(body['messageKey']).toBe('file.tooLarge');
    expect(body['messageParams']).toEqual({ max: 20 });
  });

  it('giữ nguyên các trường lỗi sẵn có: errors[] của hồ sơ và blockingReasons của cổng', () => {
    const errors = [{ field: 'vehicle.plateNumber', message: 'Chưa khai biển kiểm soát phương tiện.' }];
    const submit = runFilter(appBadRequest('dossier.submitIncomplete', undefined, { errors }));
    expect(submit.body['errors']).toEqual(errors);
    expect(submit.body['messageKey']).toBe('dossier.submitIncomplete');

    const gate = runFilter(
      appConflict(
        'gate.blocked',
        { dossierCode: 'IMP-0001', gateName: 'Cổng B1' },
        { blockingReasons: ['Chưa hoàn thành Hải quan.'] },
      ),
      'en',
    );
    expect(gate.status).toBe(409);
    expect(gate.body['blockingReasons']).toEqual(['Chưa hoàn thành Hải quan.']);
    expect(gate.body['message']).toBe('Dossier IMP-0001 is not eligible to pass gate Cổng B1.');
  });

  it('ngoại lệ Nest thuần (chưa gắn khóa) vẫn giữ nguyên lời văn — client rơi về message', () => {
    const { status, body } = runFilter(new NotFoundException('Không tìm thấy hồ sơ.'), 'en');

    expect(status).toBe(404);
    expect(body['message']).toBe('Không tìm thấy hồ sơ.');
    expect(body['messageKey']).toBeUndefined();
  });

  it('lỗi validate của ValidationPipe giữ nguyên mảng message', () => {
    const { body } = runFilter(new BadRequestException(['taxCode không được rỗng']));

    expect(body['message']).toEqual(['taxCode không được rỗng']);
    expect(body['statusCode']).toBe(400);
  });

  it('lỗi validate của ValidationPipe tự động dịch khi message là messageKey hoặc nested messageKey', () => {
    const { body: viBody } = runFilter(new BadRequestException(['enterprise.dossier.missingEmail']), 'vi');
    expect(viBody['message']).toEqual(['Chưa khai thư điện tử liên hệ.']);

    const { body: enBody } = runFilter(new BadRequestException(['dossier.missingEmail']), 'en');
    expect(enBody['message']).toEqual(['Contact email address is missing.']);
  });

  it('lỗi ngoài dự kiến thành 500 với thông báo đọc được, không lộ chi tiết kỹ thuật', () => {
    const { status, body } = runFilter(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

    expect(status).toBe(500);
    expect(body['message']).toBe('Hệ thống gặp sự cố. Vui lòng thử lại sau.');
    expect(body['error']).toBe('Internal Server Error');
  });

  it('mọi phản hồi lỗi đều có message đọc được, không bao giờ là khóa trần', () => {
    [
      appBadRequest('dossier.notFound'),
      new NotFoundException(),
      new Error('vỡ trận'),
    ].forEach((exception) => {
      const { body } = runFilter(exception, 'en');
      const message = body['message'];
      expect(typeof message).toBe('string');
      expect(String(message)).not.toMatch(/^[a-z]+(\.[A-Za-z]+)+$/);
    });
  });
});
