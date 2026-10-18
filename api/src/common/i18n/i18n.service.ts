import { Injectable } from '@nestjs/common';
import { MessageKey, MessageParams } from './message-catalog';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './locales';
import { resolveLocale, translate } from './translate';

/**
 * Bọc lõi dịch thuật để tiêm được vào provider của Nest (bộ lọc ngoại lệ, controller cần trả nhãn).
 * Logic thật nằm ở `translate.ts` dạng hàm thuần — service này cố ý không giữ trạng thái.
 */
@Injectable()
export class I18nService {
  readonly defaultLocale = DEFAULT_LOCALE;
  readonly supportedLocales = SUPPORTED_LOCALES;

  /** Ngôn ngữ client yêu cầu qua `Accept-Language`; không gửi/không hỗ trợ thì trả `vi`. */
  localeFrom(acceptLanguage?: string | string[] | null): string {
    return resolveLocale(acceptLanguage);
  }

  translate(key: MessageKey, params?: MessageParams, locale: string = DEFAULT_LOCALE): string {
    return translate(key, params, locale);
  }
}
