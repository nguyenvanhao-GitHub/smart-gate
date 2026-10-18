// =============================================================================
// Quy tắc tệp đính kèm (F11) — kiểm ngay trên trình duyệt để báo lỗi thân thiện
// thay vì để người dùng chờ tải hết rồi mới bị API từ chối.
//
// Giới hạn phải khớp API: 15 MB, chỉ PDF, ảnh và tài liệu văn phòng.
// =============================================================================

import { Translate, translateLabel } from '../models/label.util';

/** Giới hạn dung lượng một tệp — khớp cấu hình phía API. */
export const MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024;

/** Phần mở rộng được chấp nhận (viết thường, không có dấu chấm). */
export const ACCEPTED_UPLOAD_EXTENSIONS = [
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'doc',
  'docx',
  'xls',
  'xlsx',
];

/** Kiểu MIME được chấp nhận — một số trình duyệt trả rỗng nên vẫn phải xét phần mở rộng. */
export const ACCEPTED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/** Giá trị cho thuộc tính `accept` của `<input type="file">`. */
export const UPLOAD_ACCEPT_ATTRIBUTE = ACCEPTED_UPLOAD_EXTENSIONS.map((ext) => `.${ext}`).join(',');

/** Mô tả giới hạn hiển thị dưới ô kéo–thả. Truyền hàm dịch để đổi theo ngôn ngữ đang chọn. */
export function uploadHint(t?: Translate): string {
  return translateLabel('ui.upload.hint', t);
}

/** Thông tin tối thiểu của một tệp — tách khỏi `File` để test được không cần trình duyệt. */
export interface UploadCandidate {
  name: string;
  size: number;
  type?: string;
}

/** Phần mở rộng viết thường của tên tệp (rỗng nếu không có). */
export function fileExtension(fileName: string): string {
  const name = (fileName || '').trim().toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1);
}

/** Dung lượng dễ đọc theo định dạng Việt Nam: `1,5 MB`. */
export function formatFileSize(bytes: number): string {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${round(size / 1024)} KB`;
  return `${round(size / (1024 * 1024))} MB`;
}

function round(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '').replace('.', ',');
}

/**
 * Kiểm một tệp trước khi tải lên.
 * Trả về chuỗi rỗng nếu hợp lệ, ngược lại là thông báo lỗi tiếng Việt cho người dùng.
 */
export function validateUploadFile(file: UploadCandidate | null | undefined, t?: Translate): string {
  if (!file) return translateLabel('ui.upload.unreadable', t);

  const name = file.name || translateLabel('ui.upload.unknownName', t);
  const extension = fileExtension(file.name);
  const mimeType = (file.type || '').toLowerCase();
  const knownExtension = ACCEPTED_UPLOAD_EXTENSIONS.includes(extension);
  const knownMimeType = ACCEPTED_UPLOAD_MIME_TYPES.includes(mimeType);

  // Trình duyệt có thể không nhận diện được MIME (type rỗng) — khi đó tin vào phần mở rộng.
  if (!knownExtension || (!!mimeType && !knownMimeType)) {
    return translateLabel('ui.upload.typeNotAllowed', t, { name });
  }
  if (!file.size) {
    return translateLabel('ui.upload.empty', t, { name });
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return translateLabel('ui.upload.tooLarge', t, {
      name,
      size: formatFileSize(file.size),
      max: formatFileSize(MAX_UPLOAD_SIZE_BYTES),
    });
  }
  return '';
}

/** Icon Material tương ứng loại tệp — dùng cho thumbnail chứng từ ở UI-05. */
export function fileIcon(fileNameOrType: string): string {
  const value = (fileNameOrType || '').toLowerCase();
  if (value.includes('pdf')) return 'picture_as_pdf';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'image'].some((token) => value.includes(token))) return 'image';
  if (['xls', 'sheet', 'excel'].some((token) => value.includes(token))) return 'table_chart';
  if (['doc', 'word'].some((token) => value.includes(token))) return 'description';
  return 'attach_file';
}

/** Tệp là ảnh — dùng để quyết định có hiện thumbnail thật hay chỉ icon. */
export function isImageFile(contentType: string, fileName = ''): boolean {
  if ((contentType || '').toLowerCase().startsWith('image/')) return true;
  return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileExtension(fileName));
}
