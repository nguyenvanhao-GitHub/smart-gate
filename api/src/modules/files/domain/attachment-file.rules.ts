import { createHash, randomUUID } from 'crypto';

/**
 * Quy tắc an toàn cho tệp đính kèm (F11, NFR-08). Toàn bộ là hàm thuần, không phụ thuộc
 * `@nestjs/*` hay `typeorm`, nên kiểm thử được mà không cần dựng ứng dụng.
 *
 * Ba nguyên tắc không được nới:
 * 1. **Không bao giờ dùng tên tệp do client gửi làm đường dẫn lưu trữ** — khoá lưu trữ do server
 *    sinh bằng UUID. Tên gốc chỉ là metadata để hiển thị.
 * 2. Kiểu tệp xác định bằng **nội dung thật (magic bytes)**, không tin `Content-Type` hay phần
 *    mở rộng do client khai.
 * 3. Dung lượng bị chặn cứng ở cả tầng HTTP lẫn tầng use-case.
 */

export const MAX_ATTACHMENT_SIZE_MB = 15;
export const MAX_ATTACHMENT_SIZE_BYTES = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;

/** Tiền tố khoá lưu trữ — mọi đối tượng của phân hệ tệp đều nằm dưới nhánh này. */
export const STORAGE_KEY_PREFIX = 'attachments';

export const FALLBACK_FILE_NAME = 'tep-dinh-kem';

export interface AllowedFileType {
  /** Mã nội bộ, dùng trong thông báo và kiểm thử. */
  code: string;
  /** Nhãn tiếng Việt hiển thị cho người dùng. */
  label: string;
  /** MIME lưu xuống DB — lấy theo kết quả nhận dạng, KHÔNG lấy theo khai báo của client. */
  mimeType: string;
  /** Phần mở rộng chuẩn dùng để đặt tên khoá lưu trữ. */
  extension: string;
  /** Các phần mở rộng chấp nhận được cho kiểu này. */
  allowedExtensions: string[];
}

const PDF: AllowedFileType = {
  code: 'PDF',
  label: 'Tệp PDF',
  mimeType: 'application/pdf',
  extension: '.pdf',
  allowedExtensions: ['.pdf'],
};

const PNG: AllowedFileType = {
  code: 'PNG',
  label: 'Ảnh PNG',
  mimeType: 'image/png',
  extension: '.png',
  allowedExtensions: ['.png'],
};

const JPEG: AllowedFileType = {
  code: 'JPEG',
  label: 'Ảnh JPEG',
  mimeType: 'image/jpeg',
  extension: '.jpg',
  allowedExtensions: ['.jpg', '.jpeg'],
};

const DOCX: AllowedFileType = {
  code: 'DOCX',
  label: 'Văn bản Word (.docx)',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  extension: '.docx',
  allowedExtensions: ['.docx'],
};

const XLSX: AllowedFileType = {
  code: 'XLSX',
  label: 'Bảng tính Excel (.xlsx)',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  extension: '.xlsx',
  allowedExtensions: ['.xlsx'],
};

const PPTX: AllowedFileType = {
  code: 'PPTX',
  label: 'Trình chiếu PowerPoint (.pptx)',
  mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  extension: '.pptx',
  allowedExtensions: ['.pptx'],
};

const DOC_LEGACY: AllowedFileType = {
  code: 'DOC',
  label: 'Văn bản Word 97-2003 (.doc)',
  mimeType: 'application/msword',
  extension: '.doc',
  allowedExtensions: ['.doc'],
};

const XLS_LEGACY: AllowedFileType = {
  code: 'XLS',
  label: 'Bảng tính Excel 97-2003 (.xls)',
  mimeType: 'application/vnd.ms-excel',
  extension: '.xls',
  allowedExtensions: ['.xls'],
};

const PPT_LEGACY: AllowedFileType = {
  code: 'PPT',
  label: 'Trình chiếu PowerPoint 97-2003 (.ppt)',
  mimeType: 'application/vnd.ms-powerpoint',
  extension: '.ppt',
  allowedExtensions: ['.ppt'],
};

/** Danh sách trắng hiển thị cho người dùng khi tệp bị từ chối. */
export const ALLOWED_FILE_TYPES: AllowedFileType[] = [
  PDF,
  PNG,
  JPEG,
  DOCX,
  XLSX,
  PPTX,
  DOC_LEGACY,
  XLS_LEGACY,
  PPT_LEGACY,
];

export const ALLOWED_FILE_TYPE_LABELS = ALLOWED_FILE_TYPES.map((type) => type.label).join(', ');

function matches(buffer: Buffer, signature: number[], offset = 0): boolean {
  if (buffer.length < offset + signature.length) return false;
  return signature.every((byte, index) => buffer[offset + index] === byte);
}

const SIGNATURE_PDF = [0x25, 0x50, 0x44, 0x46]; // %PDF
const SIGNATURE_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SIGNATURE_JPEG = [0xff, 0xd8, 0xff];
const SIGNATURE_OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // Office 97-2003
const SIGNATURE_ZIP_LOCAL = [0x50, 0x4b, 0x03, 0x04];
const SIGNATURE_ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06];
const SIGNATURE_ZIP_SPANNED = [0x50, 0x4b, 0x07, 0x08];

/**
 * Tệp Office 97-2003 đều là container OLE2 giống hệt nhau ở magic bytes nên không phân biệt được
 * doc/xls/ppt bằng nội dung. Container đã được nhận dạng bằng magic bytes; phần mở rộng chỉ dùng
 * để chọn nhãn MIME, không dùng để quyết định tệp có được nhận hay không.
 */
function detectLegacyOffice(extension: string): AllowedFileType | null {
  if (extension === '.doc') return DOC_LEGACY;
  if (extension === '.xls') return XLS_LEGACY;
  if (extension === '.ppt') return PPT_LEGACY;
  return null;
}

/**
 * Tệp Office hiện đại (OOXML) là ZIP. Tên các phần bên trong nằm nguyên văn ở central directory
 * (không nén) nên tìm được bằng cách quét toàn bộ buffer — tệp bị chặn ở 15 MB nên chi phí không
 * đáng kể. ZIP thường (không phải OOXML) bị từ chối vì có thể là vỏ bọc cho tệp thực thi.
 */
function detectOoxml(buffer: Buffer): AllowedFileType | null {
  if (buffer.indexOf('word/document.xml', 0, 'latin1') >= 0) return DOCX;
  if (buffer.indexOf('xl/workbook.xml', 0, 'latin1') >= 0) return XLSX;
  if (buffer.indexOf('ppt/presentation.xml', 0, 'latin1') >= 0) return PPTX;
  return null;
}

/**
 * Nhận dạng kiểu tệp theo nội dung thật. Trả `null` nghĩa là **không nằm trong danh sách trắng**.
 * `fileName` chỉ dùng cho nhánh Office 97-2003; các nhánh còn lại hoàn toàn không tin tên tệp.
 */
export function detectAttachmentFileType(buffer: Buffer, fileName = ''): AllowedFileType | null {
  if (!buffer || buffer.length === 0) return null;

  if (matches(buffer, SIGNATURE_PDF)) return PDF;
  if (matches(buffer, SIGNATURE_PNG)) return PNG;
  if (matches(buffer, SIGNATURE_JPEG)) return JPEG;
  if (matches(buffer, SIGNATURE_OLE2)) return detectLegacyOffice(fileExtension(fileName));
  if (
    matches(buffer, SIGNATURE_ZIP_LOCAL) ||
    matches(buffer, SIGNATURE_ZIP_EMPTY) ||
    matches(buffer, SIGNATURE_ZIP_SPANNED)
  ) {
    return detectOoxml(buffer);
  }
  return null;
}

/** NUL byte + ký tự điều khiển: chống cắt chuỗi ở tầng dưới và chèn header HTTP khi tải về. */
// eslint-disable-next-line no-control-regex -- khớp ký tự điều khiển là **chủ đích** của biểu thức này.
const CONTROL_CHARACTERS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

/**
 * Cắt bỏ mọi thành phần đường dẫn và ký tự điều khiển trong tên tệp do client gửi.
 * Đây là hàng rào chống path traversal: `../../etc/passwd` và `..\Windows\System32\cmd.exe`
 * đều bị rút về đúng phần tên cuối cùng.
 */
export function sanitizeOriginalFileName(rawName?: string | null): string {
  if (!rawName) return FALLBACK_FILE_NAME;

  const base = rawName.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(CONTROL_CHARACTERS, '')
    // Bỏ dấu chấm mở đầu để không tạo ra tên rỗng/ẩn kiểu `..` hay `.env`.
    .replace(/^\.+/, '')
    .trim();

  if (!cleaned) return FALLBACK_FILE_NAME;
  return cleaned.slice(0, 200);
}

/** Phần mở rộng viết thường, kể cả chuỗi rỗng khi tên tệp không có phần mở rộng. */
export function fileExtension(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  if (index <= 0) return '';
  return fileName.slice(index).toLowerCase();
}

/**
 * Khoá lưu trữ do **server** sinh: `attachments/<năm>/<tháng>/<uuid><ext>`.
 * Không có bất kỳ ký tự nào đến từ tên tệp của client nên không thể thoát ra khỏi nhánh tiền tố.
 */
export function buildStorageKey(extension: string, at: Date = new Date()): string {
  const year = at.getUTCFullYear();
  const month = `${at.getUTCMonth() + 1}`.padStart(2, '0');
  return `${STORAGE_KEY_PREFIX}/${year}/${month}/${randomUUID()}${extension}`;
}

/** Checksum SHA-256 dạng hex — dùng để đối chiếu toàn vẹn tệp và phát hiện tải trùng. */
export function checksumOf(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
