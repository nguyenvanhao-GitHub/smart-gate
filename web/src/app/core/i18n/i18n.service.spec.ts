import { TestBed } from '@angular/core/testing';
import { I18nService, LOCALE_STORAGE_KEY } from './i18n.service';
import { MESSAGE_CATALOGS, SUPPORTED_LOCALES } from './locales';
import { VI_MESSAGES } from './locales/vi';

/**
 * Hợp đồng đa ngữ phía web:
 *   có bản dịch cho `messageKey` → dùng bản dịch · không có → `message` của API ·
 *   không có cả hai → chuỗi mặc định. **Không bao giờ** hiện khóa trần.
 */
describe('I18nService', () => {
  let i18n: I18nService;

  beforeEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    TestBed.configureTestingModule({});
    i18n = TestBed.inject(I18nService);
  });

  afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));

  describe('từ điển', () => {
    it('MỌI ngôn ngữ đăng ký có ĐÚNG tập khóa của tiếng Việt — bắt lỗi quên dịch', () => {
      const baseKeys = Object.keys(VI_MESSAGES).sort();

      expect(SUPPORTED_LOCALES.length).toBeGreaterThanOrEqual(2);
      SUPPORTED_LOCALES.forEach((locale) => {
        expect(Object.keys(MESSAGE_CATALOGS[locale]).sort()).toEqual(baseKeys, `thiếu/thừa khóa ở "${locale}"`);
      });
    });

    it('mọi chỗ trống {tham số} của bản dịch trùng với bản tiếng Việt', () => {
      const holes = (text: string) => (text.match(/\{(\w+)\}/g) ?? []).sort();

      SUPPORTED_LOCALES.forEach((locale) => {
        Object.entries(VI_MESSAGES).forEach(([key, viText]) => {
          const translated = MESSAGE_CATALOGS[locale][key as keyof typeof VI_MESSAGES];
          expect(holes(translated)).toEqual(holes(viText), `"${key}" ở "${locale}"`);
        });
      });
    });

    it('không ngôn ngữ nào bỏ trống lời văn', () => {
      SUPPORTED_LOCALES.forEach((locale) => {
        Object.entries(MESSAGE_CATALOGS[locale]).forEach(([key, text]) => {
          expect(text.trim().length).toBeGreaterThan(0, `"${key}" rỗng ở "${locale}"`);
        });
      });
    });
  });

  describe('dịch và đổi ngôn ngữ', () => {
    it('mặc định là tiếng Việt và nội suy tham số', () => {
      expect(i18n.locale()).toBe('vi');
      expect(i18n.t('ui.dossier.summary', { start: 1, end: 10, total: 42 })).toBe(
        'Hiển thị 1 đến 10 trong tổng số 42 hồ sơ',
      );
    });

    it('đổi ngôn ngữ thì giá trị hàm dịch đổi theo và được ghi nhớ', () => {
      i18n.setLocale('en');

      expect(i18n.locale()).toBe('en');
      expect(i18n.t('ui.common.save')).toBe('Save');
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    });

    it('bỏ qua ngôn ngữ không hỗ trợ, không làm hỏng giao diện', () => {
      i18n.setLocale('ja');

      expect(i18n.locale()).toBe('vi');
      expect(i18n.t('ui.common.save')).toBe('Lưu');
    });

    it('danh sách ngôn ngữ sinh từ sổ đăng ký, mỗi ngôn ngữ tự khai tên của mình', () => {
      expect(i18n.options().map((option) => option.code)).toEqual([...SUPPORTED_LOCALES]);
      expect(i18n.options().find((option) => option.code === 'en')?.name).toBe('English');
      expect(i18n.options().find((option) => option.code === 'vi')?.name).toBe('Tiếng Việt');
    });

    it('lựa chọn đã lưu được khôi phục ở lần khởi tạo sau', () => {
      localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});

      expect(TestBed.inject(I18nService).locale()).toBe('en');
    });
  });

  describe('lỗi API', () => {
    it('CÓ bản dịch cho messageKey thì dùng bản dịch, có nội suy messageParams', () => {
      i18n.setLocale('en');
      const error = {
        error: {
          message: 'Tệp vượt quá dung lượng cho phép (tối đa 20 MB).',
          messageKey: 'file.tooLarge',
          messageParams: { max: 20 },
        },
      };

      expect(i18n.apiError(error)).toBe('The file exceeds the allowed size (max 20 MB).');
    });

    it('THIẾU bản dịch thì hiện `message` của API, KHÔNG hiện khóa trần', () => {
      const error = {
        error: {
          message: 'Ô đỗ A01 vừa được xe khác chiếm. Hãy chọn ô còn trống.',
          messageKey: 'dispatch.slotJustTaken',
          messageParams: { slotCode: 'A01' },
        },
      };

      expect(i18n.has('dispatch.slotJustTaken')).toBeFalse();
      expect(i18n.apiError(error)).toBe('Ô đỗ A01 vừa được xe khác chiếm. Hãy chọn ô còn trống.');
      expect(i18n.apiError(error)).not.toContain('dispatch.slotJustTaken');
    });

    it('THIẾU cả bản dịch lẫn message thì dùng chuỗi mặc định, vẫn không lộ khóa', () => {
      const error = { error: { messageKey: 'khong.co.trong.tu.dien' } };

      expect(i18n.apiError(error)).toBe('Không thực hiện được thao tác. Vui lòng thử lại.');
      expect(i18n.apiError(error)).not.toContain('khong.co.trong.tu.dien');
    });

    it('lỗi mạng/lỗi kỹ thuật không có thân phản hồi thì dùng chuỗi mặc định của màn hình', () => {
      expect(i18n.apiError(new Error('Http failure response'), 'ui.dossier.loadFailed')).toBe(
        'Không tải được danh sách hồ sơ. Vui lòng kiểm tra kết nối và thử lại.',
      );
      expect(i18n.apiError(null)).toBe('Không thực hiện được thao tác. Vui lòng thử lại.');
    });

    it('gộp mảng message của ValidationPipe thành câu đọc được', () => {
      const error = { error: { message: ['taxCode không được rỗng', 'plateNumber không hợp lệ'] } };

      expect(i18n.apiError(error)).toBe('taxCode không được rỗng plateNumber không hợp lệ');
    });

    it('tham số là khóa thông báo thì được dịch lồng, là dữ liệu thì giữ nguyên', () => {
      const error = {
        error: {
          message: 'Thao tác "Từ chối" bắt buộc phải chọn mã nguyên nhân.',
          messageKey: 'workflow.reasonCodeRequired',
          messageParams: { decision: 'workflow.decision.REJECT' },
        },
      };

      expect(i18n.apiError(error)).toBe('Thao tác "Từ chối" bắt buộc phải chọn mã nguyên nhân.');
      i18n.setLocale('en');
      expect(i18n.apiError(error)).toBe('The action "Reject" requires a reason code.');
    });
  });
});
