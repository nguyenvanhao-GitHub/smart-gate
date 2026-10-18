import { MessageKey, MessageParams } from './message-catalog';
import { DEFAULT_LOCALE, MESSAGE_CATALOGS, SUPPORTED_LOCALES } from './locales';

/**
 * Lõi dịch thuật — **hàm thuần, không phụ thuộc Nest** nên dùng được cả ở tầng `domain/`
 * (quy tắc nghiệp vụ vẫn phải sinh được lời văn tiếng Việt cho log và client cũ).
 */

/** Khóa này có thật trong danh mục không. Dùng để nhận ra tham số cần dịch lồng. */
export function isMessageKey(value: unknown): value is MessageKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MESSAGE_CATALOGS[DEFAULT_LOCALE], value);
}

/** Ngôn ngữ có được hỗ trợ không (so khớp không phân biệt hoa thường). */
export function isSupportedLocale(locale: string | undefined | null): boolean {
  return !!locale && SUPPORTED_LOCALES.includes(locale.toLowerCase());
}

/**
 * Chọn ngôn ngữ từ header `Accept-Language`.
 *
 * Chấp nhận dạng đầy đủ `en-US,en;q=0.9,vi;q=0.8`: tách theo dấu phẩy, sắp theo `q` giảm dần, lấy
 * ngôn ngữ đầu tiên hệ thống có. Không khớp gì thì rơi về `vi`.
 */
export function resolveLocale(acceptLanguage?: string | string[] | null): string {
  const header = Array.isArray(acceptLanguage) ? acceptLanguage.join(',') : acceptLanguage;
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const quality = params
        .map((param) => /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(param))
        .find((matched) => !!matched);
      return { tag: tag.trim().toLowerCase(), q: quality ? Number(quality[1]) : 1 };
    })
    .filter((item) => !!item.tag)
    .sort((left, right) => right.q - left.q);

  for (const item of ranked) {
    if (item.tag === '*') return DEFAULT_LOCALE;
    // `en-US` cũng dùng từ điển `en`.
    const base = item.tag.split('-')[0];
    if (isSupportedLocale(item.tag)) return item.tag.toLowerCase();
    if (isSupportedLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Thay `{tên}` bằng giá trị tham số. Tham số thiếu thì giữ nguyên chỗ trống, không in `undefined`. */
export function interpolate(template: string, params?: MessageParams, locale: string = DEFAULT_LOCALE): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    if (name === 'placement' && (params.gateCode || params.laneCode || params.slotCode)) {
      const parts: string[] = [];
      if (params.gateCode) parts.push(translate('dispatch.placementGate', { code: String(params.gateCode) }, locale));
      if (params.laneCode) parts.push(translate('dispatch.placementLane', { code: String(params.laneCode) }, locale));
      if (params.slotCode) parts.push(translate('dispatch.placementSlot', { code: String(params.slotCode) }, locale));
      return parts.length > 0 ? parts.join(', ') : translate('dispatch.placementDefault', undefined, locale);
    }
    const value = params[name];
    if (value === undefined || value === null) return placeholder;
    // Tham số **là khóa thông báo** thì dịch lồng (nhãn thao tác, nhãn hệ thống).
    // Tham số là dữ liệu nghiệp vụ/danh mục thì giữ nguyên — xem ranh giới ở `locales/vi.ts`.
    return isMessageKey(value) ? translate(value, params, locale) : String(value);
  });
}

/**
 * Dịch một khóa sang ngôn ngữ chỉ định.
 *
 * Chuỗi rơi tự do: `ngôn ngữ yêu cầu` → `tiếng Việt` → chính khóa (chỉ xảy ra khi khóa bị xóa khỏi
 * từ điển mà mã nguồn còn gọi, và TypeScript đã chặn trường hợp đó từ lúc build).
 */
export function translate(key: MessageKey, params?: MessageParams, locale: string = DEFAULT_LOCALE): string {
  const catalog = MESSAGE_CATALOGS[locale.toLowerCase()] ?? MESSAGE_CATALOGS[DEFAULT_LOCALE];
  const template = catalog[key] ?? MESSAGE_CATALOGS[DEFAULT_LOCALE][key] ?? key;
  return interpolate(template, params, locale);
}
