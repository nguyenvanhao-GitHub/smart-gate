// =============================================================================
// Cầu nối giữa **hàm nhãn của mô hình** và từ điển đa ngữ.
//
// Các hàm nhãn (`dossierStatusLabel`, `dossierTypeLabel`, `decisionLabel`…) là hàm thuần, không
// inject được `I18nService`. Vì vậy chúng nhận thêm **một tham số tùy chọn** là hàm dịch:
//
//   · component truyền `this.t` (chính `I18nService.t`) → nhãn đổi theo ngôn ngữ đang chọn,
//     và vì `t` đọc signal ngôn ngữ nên template tự vẽ lại khi đổi ngôn ngữ;
//   · không truyền gì → rơi về **tiếng Việt**, đúng ngôn ngữ mặc định NFR-20.
//
// Nhờ vậy nơi gọi cũ (và test của mô hình) không phải sửa gì.
// =============================================================================

import { VI_MESSAGES } from '../i18n/locales/vi';
import { MessageKey, MessageParams } from '../i18n/message-catalog';

/** Hàm dịch truyền từ component — cùng chữ ký với `I18nService.t`. */
export type Translate = (key: MessageKey, params?: MessageParams) => string;

/** Dịch một khóa nhãn; thiếu hàm dịch thì dùng bản tiếng Việt. Không bao giờ trả khóa trần. */
export function translateLabel(key: MessageKey, t?: Translate, params?: MessageParams): string {
  return t ? t(key, params) : interpolateVi(VI_MESSAGES[key], params);
}

/**
 * Dịch khóa nhãn của một **mã danh mục**: mã lạ do BE thêm mới thì trả về chính mã đó
 * thay vì làm vỡ giao diện (quy ước sẵn có của mọi hàm nhãn trong `core/models`).
 */
export function translateCode(key: MessageKey | undefined, code: string, t?: Translate): string {
  if (key) return translateLabel(key, t);
  return code || '—';
}

/** Nội suy `{tên}` cho nhánh không có hàm dịch — giữ đúng hành vi của `I18nService`. */
function interpolateVi(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? placeholder : String(value);
  });
}

/** Chuẩn hóa chuỗi (bỏ dấu tiếng Việt, viết thường) để so sánh chuỗi an toàn. */
export function normalizeText(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}
