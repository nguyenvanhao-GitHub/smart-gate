import { MessageCatalog } from '../message-catalog';
import { EN_MESSAGES } from './en';
import { VI_MESSAGES } from './vi';

/**
 * SỔ ĐĂNG KÝ NGÔN NGỮ của web — chỗ duy nhất biết có những ngôn ngữ nào.
 *
 * **Thêm ngôn ngữ thứ ba (ví dụ tiếng Lào):**
 *   1. tạo `locales/lo.ts` theo mẫu `en.ts` (kiểu `MessageCatalog` ép dịch đủ khóa);
 *   2. thêm đúng một dòng `lo: LO_MESSAGES` vào bảng dưới đây.
 * Bộ chuyển ngôn ngữ trên thanh đầu trang tự hiện thêm lựa chọn mới — nhãn của ngôn ngữ lấy từ
 * chính từ điển của nó (`ui.locale.name`), nên không phải sửa component nào.
 */
export const MESSAGE_CATALOGS: Readonly<Record<string, MessageCatalog>> = {
  vi: VI_MESSAGES,
  en: EN_MESSAGES,
};

/** Ngôn ngữ mặc định — tiếng Việt, đúng NFR-20. */
export const DEFAULT_LOCALE = 'vi';

/** Danh sách mã ngôn ngữ, suy ra từ sổ đăng ký. Không nơi nào khác chép lại danh sách này. */
export const SUPPORTED_LOCALES: readonly string[] = Object.keys(MESSAGE_CATALOGS);
