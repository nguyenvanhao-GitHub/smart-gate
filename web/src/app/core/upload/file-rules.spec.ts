import {
  MAX_UPLOAD_SIZE_BYTES,
  UPLOAD_ACCEPT_ATTRIBUTE,
  fileExtension,
  fileIcon,
  formatFileSize,
  isImageFile,
  validateUploadFile,
} from './file-rules';

/**
 * Kiểm tệp phía web (F11). Sai ở đây khiến người dùng chờ tải xong 15 MB rồi mới bị API từ chối,
 * hoặc tệ hơn là chặn nhầm tệp hợp lệ nên hồ sơ không nộp được.
 */
describe('file-rules — kiểm tệp đính kèm trước khi tải lên', () => {
  function tep(name: string, size: number, type = ''): { name: string; size: number; type: string } {
    return { name, size, type };
  }

  describe('validateUploadFile — định dạng', () => {
    it('chấp nhận PDF, ảnh và tài liệu văn phòng', () => {
      expect(validateUploadFile(tep('to-khai.pdf', 1024, 'application/pdf'))).toBe('');
      expect(validateUploadFile(tep('anh-hien-truong.JPG', 2048, 'image/jpeg'))).toBe('');
      expect(validateUploadFile(tep('packing-list.xlsx', 2048, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))).toBe('');
      expect(validateUploadFile(tep('hop-dong.docx', 2048, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBe('');
    });

    it('từ chối phần mở rộng không nằm trong danh sách', () => {
      expect(validateUploadFile(tep('virus.exe', 1024, 'application/octet-stream'))).toBe(
        'Tệp "virus.exe" có định dạng không được chấp nhận. Chỉ nhận PDF, ảnh (JPG, PNG, WEBP) và tài liệu Word/Excel.',
      );
      expect(validateUploadFile(tep('khong-co-duoi', 1024))).toContain('định dạng không được chấp nhận');
    });

    it('từ chối khi phần mở rộng hợp lệ nhưng MIME lại là loại khác', () => {
      expect(validateUploadFile(tep('gia-mao.pdf', 1024, 'application/x-msdownload'))).toContain('định dạng không được chấp nhận');
    });

    it('trình duyệt không nhận diện được MIME (type rỗng) thì tin vào phần mở rộng', () => {
      expect(validateUploadFile(tep('chung-tu.pdf', 1024, ''))).toBe('');
    });
  });

  describe('validateUploadFile — dung lượng', () => {
    it('đúng bằng giới hạn 15 MB thì vẫn hợp lệ', () => {
      expect(validateUploadFile(tep('to-khai.pdf', MAX_UPLOAD_SIZE_BYTES, 'application/pdf'))).toBe('');
    });

    it('vượt 15 MB thì báo rõ dung lượng và giới hạn', () => {
      const message = validateUploadFile(tep('to-khai.pdf', 16 * 1024 * 1024, 'application/pdf'));
      expect(message).toBe('Tệp "to-khai.pdf" nặng 16 MB, vượt giới hạn 15 MB.');
    });

    it('tệp rỗng bị từ chối', () => {
      expect(validateUploadFile(tep('rong.pdf', 0, 'application/pdf'))).toBe('Tệp "rong.pdf" rỗng, vui lòng chọn tệp khác.');
    });

    it('không có tệp thì báo lỗi thay vì cho qua', () => {
      expect(validateUploadFile(null)).toBe('Không đọc được tệp đã chọn. Vui lòng thử lại.');
      expect(validateUploadFile(undefined)).toBe('Không đọc được tệp đã chọn. Vui lòng thử lại.');
    });
  });

  describe('Tiện ích hiển thị', () => {
    it('lấy phần mở rộng viết thường', () => {
      expect(fileExtension('Hoa-Don.PDF')).toBe('pdf');
      expect(fileExtension('archive.tar.gz')).toBe('gz');
      expect(fileExtension('khongduoi')).toBe('');
      expect(fileExtension('.gitignore')).toBe('');
    });

    it('định dạng dung lượng theo kiểu Việt Nam', () => {
      expect(formatFileSize(512)).toBe('512 B');
      expect(formatFileSize(1536)).toBe('1,5 KB');
      expect(formatFileSize(2 * 1024 * 1024)).toBe('2 MB');
      expect(formatFileSize(MAX_UPLOAD_SIZE_BYTES)).toBe('15 MB');
    });

    it('chọn icon theo loại tệp', () => {
      expect(fileIcon('application/pdf')).toBe('picture_as_pdf');
      expect(fileIcon('anh.png')).toBe('image');
      expect(fileIcon('bang-ke.xlsx')).toBe('table_chart');
      expect(fileIcon('hop-dong.docx')).toBe('description');
      expect(fileIcon('khac.bin')).toBe('attach_file');
    });

    it('nhận biết tệp ảnh theo MIME hoặc phần mở rộng', () => {
      expect(isImageFile('image/png')).toBe(true);
      expect(isImageFile('', 'anh.jpeg')).toBe(true);
      expect(isImageFile('application/pdf', 'to-khai.pdf')).toBe(false);
    });

    it('thuộc tính accept liệt kê đủ định dạng cho ô chọn tệp', () => {
      expect(UPLOAD_ACCEPT_ATTRIBUTE).toContain('.pdf');
      expect(UPLOAD_ACCEPT_ATTRIBUTE).toContain('.xlsx');
      expect(UPLOAD_ACCEPT_ATTRIBUTE).not.toContain('.exe');
    });
  });
});
