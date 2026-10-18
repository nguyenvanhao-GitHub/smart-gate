import { Injectable, computed, signal } from '@angular/core';
import { DEFAULT_LOCALE, MESSAGE_CATALOGS, SUPPORTED_LOCALES } from './locales';
import { MessageCatalog, MessageKey, MessageParams } from './message-catalog';

/** Khóa lưu lựa chọn ngôn ngữ. Ghi vào `localStorage` nên nhớ theo trình duyệt của người dùng. */
export const LOCALE_STORAGE_KEY = 'smart-gate-locale';

/** Mã locale cho `Intl` (định dạng ngày/số) tương ứng từng ngôn ngữ giao diện. */
const INTL_LOCALES: Record<string, string> = { vi: 'vi-VN', en: 'en-US' };

/** Một lựa chọn trên bộ chuyển ngôn ngữ. Nhãn lấy từ chính từ điển của ngôn ngữ đó. */
export interface LocaleOption {
  code: string;
  name: string;
  shortName: string;
}

function isSupported(code: string | null | undefined): code is string {
  return !!code && SUPPORTED_LOCALES.includes(code);
}

function readStoredLocale(): string {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isSupported(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    // Trình duyệt chặn lưu trữ — dùng ngôn ngữ mặc định.
    return DEFAULT_LOCALE;
  }
}

/**
 * Dịch thuật phía web, **dựa trên signal**.
 *
 * Template gọi `t('ui.…')`; hàm này đọc signal `locale` nên Angular ghi nhận template là "người
 * tiêu thụ" của signal đó — đổi ngôn ngữ là giao diện tự vẽ lại, **không tải lại trang**.
 *
 * Quy tắc rơi tự do (fail-soft, không bao giờ để lộ khóa trần ra màn hình):
 *   khóa trong từ điển ngôn ngữ đang chọn → khóa trong từ điển tiếng Việt → chuỗi mặc định.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly current = signal<string>(readStoredLocale());

  /** Ngôn ngữ đang chọn. Đọc trong template/`computed` để tự cập nhật khi đổi. */
  readonly locale = this.current.asReadonly();

  /** Danh sách ngôn ngữ cho bộ chuyển trên thanh đầu trang — sinh từ sổ đăng ký. */
  readonly options = computed<LocaleOption[]>(() =>
    SUPPORTED_LOCALES.map((code) => ({
      code,
      name: this.textIn(code, 'ui.locale.name'),
      shortName: this.textIn(code, 'ui.locale.shortName'),
    })),
  );

  /** Ngôn ngữ hiện tại dưới dạng nhãn ngắn (VI / EN…). */
  readonly shortName = computed(() => this.textIn(this.current(), 'ui.locale.shortName'));

  /** Mã locale cho `Intl` (định dạng ngày/số) — đọc signal nên đổi ngôn ngữ là định dạng đổi theo. */
  readonly dateLocale = computed(() => INTL_LOCALES[this.current()] ?? INTL_LOCALES[DEFAULT_LOCALE]);

  /**
   * Dịch một khóa. Khai báo dạng thuộc tính (arrow function) để component gán thẳng
   * `protected readonly t = inject(I18nService).t;` rồi dùng `{{ t('ui.common.save') }}`.
   */
  readonly t = (key: MessageKey, params?: MessageParams): string => this.textIn(this.current(), key, params);

  setLocale(code: string): void {
    if (!isSupported(code) || code === this.current()) return;
    this.current.set(code);
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = code;
    }
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, code);
    } catch {
      // Không lưu được thì vẫn đổi trong phiên hiện tại.
    }
  }

  /**
   * Lời văn của một lỗi API theo đúng hợp đồng đã chốt:
   *   1. có bản dịch cho `messageKey` → dùng bản dịch (nội suy `messageParams`);
   *   2. không có → rơi về `message` do API gửi kèm (luôn có, và API đã dịch theo `Accept-Language`);
   *   3. không có cả hai → chuỗi mặc định.
   * Khóa trần **không bao giờ** được trả ra.
   */
  apiError(error: unknown, fallback: MessageKey = 'ui.common.unknownError', fallbackParams?: MessageParams): string {
    const body = unwrapErrorBody(error);
    const key = body?.['messageKey'];
    if (typeof key === 'string' && this.has(key)) {
      return this.t(key as MessageKey, body?.['messageParams'] as MessageParams | undefined);
    }

    if (body) {
      const message = body['message'];
      if (typeof message === 'string' && message.trim()) return message;
      // `ValidationPipe` trả `message` là mảng chuỗi — ghép lại cho người dùng đọc được.
      if (Array.isArray(message) && message.length > 0) return message.filter((item) => !!item).join(' ');
    }

    return this.t(fallback, fallbackParams);
  }

  /**
   * Bản dịch của một lỗi theo trường (`errors[]` của API) — trả **chuỗi rỗng** khi web chưa có bản
   * dịch cho khóa, để nơi gọi rơi về `message` của API. Dùng làm `FieldErrorTranslator`.
   */
  readonly fieldError = (error: { messageKey?: string; messageParams?: MessageParams }): string =>
    error?.messageKey && this.has(error.messageKey)
      ? this.t(error.messageKey as MessageKey, error.messageParams)
      : '';

  /** Khóa có trong danh mục không — dùng để nhận ra `messageKey` web đã dịch được. */
  has(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(MESSAGE_CATALOGS[DEFAULT_LOCALE], key);
  }

  // `key` khai `string` (không phải `MessageKey`): ngoài khóa web biết trước, hàm còn nhận khóa
  // lồng do `interpolate` truyền vào và khóa lạ do API gửi — `lastResort` lo nốt ca đó.
  private textIn(locale: string, key: string, params?: MessageParams): string {
    const catalog: MessageCatalog = MESSAGE_CATALOGS[locale] ?? MESSAGE_CATALOGS[DEFAULT_LOCALE];
    const fallbackCatalog = MESSAGE_CATALOGS[DEFAULT_LOCALE];
    const template =
      catalog[key as MessageKey] ?? fallbackCatalog[key as MessageKey] ?? this.lastResort(key);
    return interpolate(template, params, (nested) => this.textIn(locale, nested));
  }

  /**
   * Khóa không có trong bất kỳ từ điển nào (chỉ xảy ra khi API gửi khóa web chưa biết mà lại không
   * kèm `message`). Trả chuỗi mặc định chứ **không** trả khóa.
   */
  private lastResort(key: string): string {
    const isEn = this.locale() === 'en';
    if (key === 'ui.common.unknownError') {
      return isEn
        ? 'The operation could not be completed. Please try again.'
        : 'Không thực hiện được thao tác. Vui lòng thử lại.';
    }
    return (
      MESSAGE_CATALOGS[this.locale()]?.['ui.common.unknownError'] ??
      MESSAGE_CATALOGS[DEFAULT_LOCALE]['ui.common.unknownError']
    );
  }
}

/** Thay `{tên}`; tham số là khóa thông báo thì dịch lồng, là dữ liệu thì giữ nguyên. */
function interpolate(
  template: string,
  params: MessageParams | undefined,
  translateNested: (key: string) => string,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name];
    if (value === undefined || value === null) return placeholder;
    const text = String(value);
    return Object.prototype.hasOwnProperty.call(MESSAGE_CATALOGS[DEFAULT_LOCALE], text)
      ? translateNested(text)
      : text;
  });
}

/**
 * Lấy **thân lỗi do API trả về**.
 *
 * `HttpErrorResponse` để thân lỗi ở `error`; `message` ở ngoài chỉ là câu kỹ thuật
 * ("Http failure response for …") nên không được dùng làm thông báo cho người dùng. Tương tự, một
 * `Error` thuần của JavaScript (lỗi mạng, lỗi mã nguồn) cũng không có thông báo dành cho người dùng
 * — trả `null` để rơi về chuỗi mặc định của màn hình.
 */
function unwrapErrorBody(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== 'object') return null;
  const outer = error as Record<string, unknown>;
  const inner = outer['error'];
  if (inner && typeof inner === 'object') return inner as Record<string, unknown>;
  return error instanceof Error ? null : outer;
}
