import { VI_MESSAGES } from './locales/vi';

/**
 * Khóa thông báo — **hợp đồng giữa API và client**.
 *
 * Danh sách khóa lấy từ từ điển tiếng Việt (`locales/vi.ts`) nên không thể gõ sai: use-case truyền
 * chuỗi không có trong danh mục là lỗi biên dịch. Đổi lời văn tiếng Việt **không được** đổi khóa —
 * khóa là thứ client dùng để tra bản dịch của mình.
 */
export type MessageKey = keyof typeof VI_MESSAGES;

/**
 * Một từ điển ngôn ngữ. Kiểu `Record<MessageKey, string>` ép **mọi ngôn ngữ phải có đủ mọi khóa**:
 * quên dịch một dòng là build đỏ, không phải đợi người dùng phát hiện.
 */
export type MessageCatalog = Record<MessageKey, string>;

/**
 * Tham số nội suy vào lời văn (`{tên}`).
 *
 * Giá trị là **dữ liệu** (mã hồ sơ, biển số, số lượng…) nên không dịch. Ngoại lệ duy nhất: nếu giá
 * trị là một `MessageKey` hợp lệ thì được dịch lồng — dùng cho nhãn hệ thống như tên thao tác.
 */
export type MessageParams = Record<string, string | number | boolean | null | undefined>;
