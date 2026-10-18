import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { MAX_ATTACHMENT_SIZE_BYTES, STORAGE_KEY_PREFIX } from '../../domain/attachment-file.rules';
import {
  FakeDocumentTypeCatalog,
  FakeStorage,
  InMemoryAttachmentRepository,
  RecordingAuditLogger,
  executableFile,
  oversizedPdfFile,
  pdfFile,
  plainTextFile,
  pngFile,
} from '../../testing/attachment.fixture';
import { UploadAttachmentUseCase } from './upload-attachment.use-case';

describe('UploadAttachmentUseCase', () => {
  let attachments: InMemoryAttachmentRepository;
  let storage: FakeStorage;
  let audit: RecordingAuditLogger;
  let useCase: UploadAttachmentUseCase;

  beforeEach(() => {
    attachments = new InMemoryAttachmentRepository();
    storage = new FakeStorage();
    audit = new RecordingAuditLogger();
    useCase = new UploadAttachmentUseCase(attachments, storage, new FakeDocumentTypeCatalog(), audit);
  });

  const upload = (overrides: Partial<Parameters<UploadAttachmentUseCase['execute']>[0]> = {}) =>
    useCase.execute({
      fileName: 'to-khai.pdf',
      content: pdfFile(),
      actorId: 'user-dn-a',
      ...overrides,
    });

  describe('chống path traversal', () => {
    it('không dùng tên tệp của client làm khoá lưu trữ', async () => {
      const view = await upload({ fileName: '../../etc/passwd.pdf' });

      const [storageKey] = [...storage.objects.keys()];
      expect(storageKey).toMatch(/^attachments\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/);
      expect(storageKey).not.toContain('..');
      expect(storageKey).not.toContain('passwd');
      expect(storageKey.startsWith(`${STORAGE_KEY_PREFIX}/`)).toBe(true);
      // Tên gốc chỉ còn phần tên tệp, đã bị cắt hết đường dẫn.
      expect(view.fileName).toBe('passwd.pdf');
    });

    it('không lộ khoá lưu trữ, tên/mime kỹ thuật ra ngoài qua API', async () => {
      const view = await upload();
      expect(view).not.toHaveProperty('storageKey');
      // Response dùng shape của web (`fileName`/`contentType`), không lộ trường nội bộ.
      expect(view).not.toHaveProperty('originalName');
      expect(view).not.toHaveProperty('mimeType');
      expect(view).not.toHaveProperty('checksum');
    });

    it('làm sạch tên tệp kiểu Windows và vẫn lưu được', async () => {
      const view = await upload({ fileName: '..\\..\\Windows\\System32\\bao-cao.pdf' });
      expect(view.fileName).toBe('bao-cao.pdf');
      expect(attachments.rows.size).toBe(1);
    });
  });

  describe('danh sách trắng kiểu tệp', () => {
    it('từ chối tệp thực thi dù client đặt tên .pdf', async () => {
      await expect(upload({ fileName: 'to-khai.pdf', content: executableFile() })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(storage.objects.size).toBe(0);
      expect(attachments.rows.size).toBe(0);
    });

    it('từ chối tệp văn bản thuần với thông báo tiếng Việt', async () => {
      await expect(upload({ content: plainTextFile() })).rejects.toThrow(/Định dạng tệp không được phép/);
    });

    it('từ chối khi phần mở rộng không khớp nội dung thật', async () => {
      await expect(upload({ fileName: 'anh-hien-truong.pdf', content: pngFile() })).rejects.toThrow(
        /không khớp với nội dung thật/,
      );
    });

    it('nhận PDF hợp lệ và ghi MIME theo nội dung thật', async () => {
      const view = await upload();
      expect(view.contentType).toBe('application/pdf');
      expect(view.fileName).toBe('to-khai.pdf');
    });
  });

  describe('giới hạn dung lượng', () => {
    it('từ chối tệp vượt 15 MB kèm thông báo tiếng Việt', async () => {
      await expect(upload({ content: oversizedPdfFile(MAX_ATTACHMENT_SIZE_BYTES + 1) })).rejects.toThrow(
        /Tệp vượt quá dung lượng cho phép \(tối đa 15 MB\)/,
      );
      expect(storage.objects.size).toBe(0);
    });

    it('chấp nhận tệp đúng bằng ngưỡng', async () => {
      const view = await upload({ content: oversizedPdfFile(MAX_ATTACHMENT_SIZE_BYTES) });
      expect(view.sizeBytes).toBe(MAX_ATTACHMENT_SIZE_BYTES);
    });

    it('từ chối tệp rỗng', async () => {
      await expect(upload({ content: Buffer.alloc(0) })).rejects.toThrow(/tệp rỗng/);
    });
  });

  describe('mã loại chứng từ và nhật ký', () => {
    it('từ chối mã loại chứng từ ngoài danh mục', async () => {
      await expect(upload({ documentTypeCode: 'KHONG_CO_THAT' })).rejects.toThrow(
        /Mã loại chứng từ không tồn tại/,
      );
    });

    it('ghi nhật ký kiểm toán và trả tên loại chứng từ từ danh mục', async () => {
      const view = await upload({ documentTypeCode: 'CUSTOMS_DECLARATION', dossierId: 'decl-001' });

      expect(audit.entries).toHaveLength(1);
      expect(audit.entries[0]).toMatchObject({
        action: 'ATTACHMENT_UPLOAD',
        targetType: 'ATTACHMENT',
        targetId: view.id,
      });
      expect(view.documentTypeCode).toBe('CUSTOMS_DECLARATION');
      // Ngay sau upload đã có `documentTypeName` — phản hồi khớp đường tải-lại hồ sơ.
      expect(view.documentTypeName).toBe('Tờ khai hải quan');
    });

    it('trả documentTypeName null khi tệp chưa gắn loại chứng từ', async () => {
      const view = await upload();
      expect(view.documentTypeCode).toBeNull();
      expect(view.documentTypeName).toBeNull();
    });
  });

  describe('khi chưa cấu hình kho lưu trữ', () => {
    it('trả lỗi 503 tiếng Việt thay vì lỗi kỹ thuật', async () => {
      useCase = new UploadAttachmentUseCase(
        attachments,
        new FakeStorage(false),
        new FakeDocumentTypeCatalog(),
        audit,
      );
      await expect(upload()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('khi ghi database hỏng sau lúc đã đẩy tệp lên kho', () => {
    it('dọn đối tượng mồ côi rồi mới ném lỗi', async () => {
      jest.spyOn(attachments, 'save').mockRejectedValueOnce(new Error('DB down'));

      await expect(upload()).rejects.toThrow('DB down');
      expect(storage.removed).toHaveLength(1);
      expect(storage.objects.size).toBe(0);
    });
  });
});
