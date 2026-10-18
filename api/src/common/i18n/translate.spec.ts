import { MESSAGE_CATALOGS, SUPPORTED_LOCALES } from './locales';
import { VI_MESSAGES } from './locales/vi';
import { appBadRequest, appConflict } from './app-exception';
import { I18nService } from './i18n.service';
import { interpolate, isMessageKey, resolveLocale, translate } from './translate';

describe('Từ điển thông báo', () => {
  it('MỌI ngôn ngữ đăng ký đều có ĐÚNG tập khóa của tiếng Việt — bắt lỗi quên dịch', () => {
    const baseKeys = Object.keys(VI_MESSAGES).sort();

    // Cố ý duyệt theo sổ đăng ký chứ không viết cứng 'vi'/'en': thêm ngôn ngữ thứ ba là test này
    // tự kiểm luôn, không phải sửa gì.
    expect(SUPPORTED_LOCALES.length).toBeGreaterThanOrEqual(2);
    SUPPORTED_LOCALES.forEach((locale) => {
      expect({ locale, keys: Object.keys(MESSAGE_CATALOGS[locale]).sort() }).toEqual({ locale, keys: baseKeys });
    });
  });

  it('không ngôn ngữ nào để lời văn rỗng', () => {
    SUPPORTED_LOCALES.forEach((locale) => {
      Object.entries(MESSAGE_CATALOGS[locale]).forEach(([key, text]) => {
        expect(`${locale}:${key}:${text.trim().length > 0}`).toBe(`${locale}:${key}:true`);
      });
    });
  });

  it('mọi chỗ trống {tham số} của bản dịch phải trùng với bản tiếng Việt', () => {
    const placeholders = (text: string) => (text.match(/\{(\w+)\}/g) ?? []).sort();

    SUPPORTED_LOCALES.forEach((locale) => {
      Object.entries(VI_MESSAGES).forEach(([key, viText]) => {
        const translated = MESSAGE_CATALOGS[locale][key as keyof typeof VI_MESSAGES];
        expect({ locale, key, params: placeholders(translated) }).toEqual({
          locale,
          key,
          params: placeholders(viText),
        });
      });
    });
  });
});

describe('translate()', () => {
  it('mặc định trả tiếng Việt, có nội suy tham số', () => {
    expect(translate('file.tooLarge', { max: 20 })).toBe('Tệp vượt quá dung lượng cho phép (tối đa 20 MB).');
  });

  it('trả tiếng Anh khi được yêu cầu', () => {
    expect(translate('file.tooLarge', { max: 20 }, 'en')).toBe('The file exceeds the allowed size (max 20 MB).');
  });

  it('tham số là dữ liệu nghiệp vụ thì giữ nguyên, là khóa thông báo thì dịch lồng', () => {
    // Tên bước/lực lượng là dữ liệu danh mục → không dịch.
    expect(translate('workflow.roleNotAllowed', { step: 'Kiểm dịch y tế', agency: 'Kiểm dịch Y tế' }, 'en')).toBe(
      'Your current role cannot process step "Kiểm dịch y tế" (owned by Kiểm dịch Y tế).',
    );
    // Nhãn thao tác là lời văn hệ thống → truyền dưới dạng khóa và được dịch theo ngôn ngữ.
    expect(translate('workflow.reasonNoteRequired', { decision: 'workflow.decision.REJECT' })).toBe(
      'Thao tác "Từ chối" bắt buộc phải nhập nội dung lý do.',
    );
    expect(translate('workflow.reasonNoteRequired', { decision: 'workflow.decision.REJECT' }, 'en')).toBe(
      'The action "Reject" requires a written reason.',
    );
  });

  it('dịch lồng tham số có kèm index (tag phương tiện / dòng hàng)', () => {
    expect(translate('dossier.missingPlateNumber', { tag: 'dossier.tagVehicle', index: 2 }, 'vi')).toBe(
      'Phương tiện 2: Chưa khai biển kiểm soát.',
    );
    expect(translate('dossier.missingPlateNumber', { tag: 'dossier.tagVehicle', index: 2 }, 'en')).toBe(
      'Vehicle 2: License plate number is missing.',
    );
    expect(translate('dossier.missingQuantity', { tag: 'dossier.tagCargo', index: 3 }, 'en')).toBe(
      'Cargo line 3: Quantity is missing.',
    );
  });

  it('tự dịch cấu trúc vị trí điều phối {placement} theo ngôn ngữ', () => {
    const params = { code: 'IMP-001', gateCode: 'B1', laneCode: 'L1', slotCode: 'A-01' };
    expect(translate('notification.dossierAssignedContent', params, 'vi')).toBe(
      'Phương tiện của hồ sơ IMP-001 được điều phối tới cổng B1, làn L1, ô đỗ A-01.',
    );
    expect(translate('notification.dossierAssignedContent', params, 'en')).toBe(
      'Vehicle for dossier IMP-001 assigned to gate B1, lane L1, parking slot A-01.',
    );
  });

  it('ngôn ngữ lạ thì rơi về tiếng Việt thay vì trả khóa trần', () => {
    expect(translate('dossier.notFound', undefined, 'ja')).toBe('Không tìm thấy hồ sơ.');
  });

  it('thiếu tham số thì giữ chỗ trống, không in "undefined"', () => {
    expect(interpolate('Còn {a} và {b}.', { a: 1 })).toBe('Còn 1 và {b}.');
  });

  it('isMessageKey chỉ nhận khóa có thật', () => {
    expect(isMessageKey('dossier.notFound')).toBe(true);
    expect(isMessageKey('dossier.khongCoThat')).toBe(false);
    expect(isMessageKey(42)).toBe(false);
  });
});

describe('resolveLocale()', () => {
  it.each([
    [undefined, 'vi'],
    ['', 'vi'],
    ['en', 'en'],
    ['EN-US', 'en'],
    ['en-US,en;q=0.9,vi;q=0.8', 'en'],
    ['vi-VN,vi;q=0.9,en;q=0.8', 'vi'],
    ['ja,ko;q=0.9', 'vi'],
    ['*', 'vi'],
    ['ja;q=0.9,en;q=1.0', 'en'],
  ])('Accept-Language %p → %p', (header, expected) => {
    expect(resolveLocale(header)).toBe(expected);
  });
});

describe('I18nService', () => {
  const service = new I18nService();

  it('mở lõi dịch thuật ra cho tầng có DI', () => {
    expect(service.defaultLocale).toBe('vi');
    expect(service.supportedLocales).toEqual(SUPPORTED_LOCALES);
    expect(service.localeFrom('en-GB,en;q=0.9')).toBe('en');
    expect(service.localeFrom(undefined)).toBe('vi');
    expect(service.translate('dossier.notFound', undefined, 'en')).toBe('Dossier not found.');
  });
});

describe('Ngoại lệ có khóa', () => {
  it('mang đủ message tiếng Việt + messageKey + messageParams', () => {
    const error = appBadRequest('file.tooLarge', { max: 20 });

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Tệp vượt quá dung lượng cho phép (tối đa 20 MB).',
      messageKey: 'file.tooLarge',
      messageParams: { max: 20 },
    });
    // `error.message` của Nest vẫn là câu tiếng Việt → log server và client cũ không đổi.
    expect(error.message).toBe('Tệp vượt quá dung lượng cho phép (tối đa 20 MB).');
  });

  it('giữ nguyên các trường lỗi sẵn có kèm theo', () => {
    const error = appConflict(
      'gate.blocked',
      { dossierCode: 'IMP-0001', gateName: 'Cổng B1' },
      { blockingReasons: ['Chưa hoàn thành Hải quan.'] },
    );

    expect(error.getResponse()).toMatchObject({
      messageKey: 'gate.blocked',
      message: 'Hồ sơ IMP-0001 chưa đủ điều kiện qua cổng Cổng B1.',
      blockingReasons: ['Chưa hoàn thành Hải quan.'],
    });
  });
});
