/**
 * Tiện ích của riêng tầng HTTP cho việc nhận/trả tệp. Không chứa quy tắc nghiệp vụ — quy tắc an
 * toàn (làm sạch tên tệp, nhận dạng kiểu tệp, giới hạn dung lượng) nằm ở `domain/attachment-file.rules.ts`.
 */

/**
 * Busboy/multer giải mã tên tệp trong multipart theo `latin1`, nên tên tệp tiếng Việt về tới đây
 * thành ký tự rác. Giải mã lại sang UTF-8; nếu kết quả có ký tự thay thế (chuỗi gốc vốn không phải
 * UTF-8) thì giữ nguyên bản gốc.
 */
export function decodeMultipartFileName(rawName?: string): string | undefined {
  if (!rawName) return undefined;
  const decoded = Buffer.from(rawName, 'latin1').toString('utf8');
  return decoded.includes('�') ? rawName : decoded;
}

/**
 * Header `Content-Disposition` theo RFC 5987: phần `filename` ASCII làm dự phòng cho trình duyệt cũ,
 * phần `filename*` mang tên tiếng Việt có dấu. Mọi ký tự ngoài ASCII in được đều bị thay thế ở phần
 * dự phòng để không chèn được xuống dòng vào header.
 */
export function buildContentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'attachment';
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
