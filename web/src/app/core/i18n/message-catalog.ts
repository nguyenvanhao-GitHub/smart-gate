import { VI_MESSAGES } from './locales/vi';

/**
 * Khóa thông báo phía web. Suy ra từ từ điển tiếng Việt nên gõ sai khóa trong template là lỗi
 * biên dịch — không có chuỗi tự do rải rác.
 */
export type MessageKey = keyof typeof VI_MESSAGES;

/** Một từ điển ngôn ngữ: `Record<MessageKey, string>` ép mọi ngôn ngữ phải dịch đủ khóa. */
export type MessageCatalog = Record<MessageKey, string>;

/**
 * Tham số nội suy `{tên}`. Giá trị là **dữ liệu** nên không dịch; ngoại lệ duy nhất là giá trị
 * chính là một `MessageKey` (nhãn hệ thống) thì được dịch lồng.
 */
export type MessageParams = Record<string, string | number | boolean | null | undefined>;
