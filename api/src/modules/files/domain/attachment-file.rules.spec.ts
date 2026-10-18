import {
  FALLBACK_FILE_NAME,
  MAX_ATTACHMENT_SIZE_BYTES,
  STORAGE_KEY_PREFIX,
  buildStorageKey,
  checksumOf,
  detectAttachmentFileType,
  fileExtension,
  sanitizeOriginalFileName,
} from './attachment-file.rules';
import {
  docxFile,
  executableFile,
  jpegFile,
  legacyOfficeFile,
  pdfFile,
  plainTextFile,
  plainZipFile,
  pngFile,
  xlsxFile,
} from '../testing/attachment.fixture';

describe('attachment-file.rules', () => {
  describe('sanitizeOriginalFileName — chống path traversal', () => {
    it('cắt bỏ đường dẫn POSIX trong tên tệp độc hại', () => {
      expect(sanitizeOriginalFileName('../../etc/passwd')).toBe('passwd');
      expect(sanitizeOriginalFileName('/etc/shadow')).toBe('shadow');
      expect(sanitizeOriginalFileName('../../../../../../root/.ssh/id_rsa')).toBe('id_rsa');
    });

    it('cắt bỏ đường dẫn Windows trong tên tệp độc hại', () => {
      expect(sanitizeOriginalFileName('..\\..\\Windows\\System32\\cmd.exe')).toBe('cmd.exe');
      expect(sanitizeOriginalFileName('C:\\Users\\Admin\\.env')).toBe('env');
    });

    it('không để lọt tên rỗng, tên toàn dấu chấm hay ký tự điều khiển', () => {
      expect(sanitizeOriginalFileName('..')).toBe(FALLBACK_FILE_NAME);
      expect(sanitizeOriginalFileName('')).toBe(FALLBACK_FILE_NAME);
      expect(sanitizeOriginalFileName(undefined)).toBe(FALLBACK_FILE_NAME);
      // Ký tự xuống dòng bị loại để không chèn được header HTTP khi tải tệp về.
      expect(sanitizeOriginalFileName('to-khai\r\nSet-Cookie: x=1.pdf')).toBe('to-khaiSet-Cookie: x=1.pdf');
    });

    it('giữ nguyên tên tiếng Việt có dấu và cắt độ dài tối đa 200 ký tự', () => {
      expect(sanitizeOriginalFileName('Tờ khai hải quan.pdf')).toBe('Tờ khai hải quan.pdf');
      expect(sanitizeOriginalFileName('a'.repeat(500))).toHaveLength(200);
    });
  });

  describe('buildStorageKey — khoá lưu trữ do server sinh', () => {
    it('không chứa bất kỳ phần nào của tên tệp client gửi', () => {
      const key = buildStorageKey('.pdf', new Date('2026-07-22T00:00:00.000Z'));
      expect(key).toMatch(/^attachments\/2026\/07\/[0-9a-f-]{36}\.pdf$/);
      expect(key).not.toContain('..');
      expect(key.startsWith(`${STORAGE_KEY_PREFIX}/`)).toBe(true);
    });

    it('sinh khoá khác nhau cho mỗi lần gọi', () => {
      expect(buildStorageKey('.pdf')).not.toBe(buildStorageKey('.pdf'));
    });
  });

  describe('detectAttachmentFileType — kiểm bằng nội dung thật', () => {
    it('nhận đúng các định dạng trong danh sách trắng', () => {
      expect(detectAttachmentFileType(pdfFile())?.code).toBe('PDF');
      expect(detectAttachmentFileType(pngFile())?.code).toBe('PNG');
      expect(detectAttachmentFileType(jpegFile())?.code).toBe('JPEG');
      expect(detectAttachmentFileType(docxFile(), 'bao-cao.docx')?.code).toBe('DOCX');
      expect(detectAttachmentFileType(xlsxFile(), 'bang-ke.xlsx')?.code).toBe('XLSX');
      expect(detectAttachmentFileType(legacyOfficeFile(), 'cong-van.doc')?.code).toBe('DOC');
    });

    it('từ chối tệp ngoài danh sách trắng dù đổi phần mở rộng thành .pdf', () => {
      expect(detectAttachmentFileType(executableFile(), 'to-khai.pdf')).toBeNull();
      expect(detectAttachmentFileType(plainTextFile(), 'to-khai.pdf')).toBeNull();
      // ZIP thường có thể bọc mã độc — chỉ nhận ZIP đúng cấu trúc OOXML.
      expect(detectAttachmentFileType(plainZipFile(), 'bao-cao.docx')).toBeNull();
    });

    it('không nhận container OLE2 khi phần mở rộng không phải doc/xls/ppt', () => {
      expect(detectAttachmentFileType(legacyOfficeFile(), 'cong-van.exe')).toBeNull();
    });

    it('trả null với buffer rỗng', () => {
      expect(detectAttachmentFileType(Buffer.alloc(0), 'a.pdf')).toBeNull();
    });

    it('lấy MIME theo nội dung, không theo khai báo của client', () => {
      expect(detectAttachmentFileType(pngFile(), 'anh.png')?.mimeType).toBe('image/png');
    });
  });

  describe('fileExtension', () => {
    it('trả phần mở rộng viết thường', () => {
      expect(fileExtension('TO-KHAI.PDF')).toBe('.pdf');
      expect(fileExtension('archive.tar.gz')).toBe('.gz');
      expect(fileExtension('khong-co-duoi')).toBe('');
    });
  });

  describe('ngưỡng dung lượng và checksum', () => {
    it('ngưỡng dung lượng là 15 MB', () => {
      expect(MAX_ATTACHMENT_SIZE_BYTES).toBe(15 * 1024 * 1024);
    });

    it('checksum SHA-256 ổn định và đổi khi nội dung đổi', () => {
      const first = checksumOf(Buffer.from('noi dung'));
      expect(first).toHaveLength(64);
      expect(checksumOf(Buffer.from('noi dung'))).toBe(first);
      expect(checksumOf(Buffer.from('noi dung khac'))).not.toBe(first);
    });
  });
});
