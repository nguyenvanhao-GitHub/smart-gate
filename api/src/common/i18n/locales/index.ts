import { MessageCatalog } from '../message-catalog';
import { EN_MESSAGES } from './en';
import { VI_MESSAGES } from './vi';

/**
 * SỔ ĐĂNG KÝ NGÔN NGỮ — chỗ duy nhất biết hệ thống có những ngôn ngữ nào.
 *
 * **Thêm ngôn ngữ thứ ba (ví dụ tiếng Lào cho cửa khẩu Chiềng Khương):**
 *   1. tạo `locales/lo.ts` theo mẫu `en.ts` (kiểu `MessageCatalog` ép phải dịch đủ khóa);
 *   2. thêm đúng một dòng `lo: LO_MESSAGES` vào bảng dưới đây.
 * Không sửa gì thêm: không có chỗ nào khác trong mã nguồn liệt kê danh sách ngôn ngữ, không có
 * `if (locale === 'en')` ở bất kỳ đâu.
 */
export const MESSAGE_CATALOGS: Readonly<Record<string, MessageCatalog>> = {
  vi: VI_MESSAGES,
  en: EN_MESSAGES,
};

/** Ngôn ngữ mặc định: mọi thông báo luôn có sẵn bản tiếng Việt (log, Swagger, client cũ). */
export const DEFAULT_LOCALE = 'vi';

/** Mã ngôn ngữ hệ thống hỗ trợ, suy ra từ sổ đăng ký — không hằng số nào chép lại danh sách này. */
export const SUPPORTED_LOCALES: readonly string[] = Object.keys(MESSAGE_CATALOGS);
