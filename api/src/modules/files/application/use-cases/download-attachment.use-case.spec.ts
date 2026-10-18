import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { AssignmentType } from '../../../access-control/domain/assignment-type.enum';
import { DataScopeLevel } from '../../../access-control/domain/data-scope.enum';
import { AttachmentStatus } from '../../domain/attachment-status.enum';
import { Attachment } from '../../domain/attachment.entity';
import {
  FakeDossierOwnership,
  FakeStorage,
  InMemoryAttachmentRepository,
  RecordingAuditLogger,
  makeAccess,
  pdfFile,
} from '../../testing/attachment.fixture';
import { AttachmentScopeService } from '../services/attachment-scope.service';
import { DownloadAttachmentUseCase } from './download-attachment.use-case';

/**
 * Trọng tâm: người dùng phạm vi `OWN` **không được** tải tệp thuộc hồ sơ của doanh nghiệp khác,
 * kể cả khi đoán đúng id tệp. Đây là lỗ hổng nghiêm trọng nhất của tính năng đính kèm.
 */
describe('DownloadAttachmentUseCase — phạm vi dữ liệu', () => {
  const STORAGE_KEY = 'attachments/2026/07/11111111-1111-4111-8111-111111111111.pdf';

  const ownership = new FakeDossierOwnership([
    { dossierId: 'decl-cua-A', createdById: 'user-dn-a', taxCode: '5500111111' },
    { dossierId: 'decl-cua-B', createdById: 'user-dn-b', taxCode: '5500222222' },
  ]);

  function makeAttachment(overrides: Partial<{ dossierId: string | null; uploadedById: string }> = {}): Attachment {
    return new Attachment(
      'att-001',
      overrides.dossierId === undefined ? 'decl-cua-B' : overrides.dossierId,
      'to-khai.pdf',
      'application/pdf',
      1024,
      STORAGE_KEY,
      'checksum',
      'CUSTOMS_DECLARATION',
      overrides.uploadedById ?? 'user-dn-b',
      new Date('2026-07-22T08:00:00.000Z'),
      AttachmentStatus.ACTIVE,
      null,
      null,
    );
  }

  function buildUseCase(attachment: Attachment | null): {
    useCase: DownloadAttachmentUseCase;
    storage: FakeStorage;
    audit: RecordingAuditLogger;
  } {
    const attachments = new InMemoryAttachmentRepository(attachment ? [attachment] : []);
    const storage = new FakeStorage();
    void storage.put({ key: STORAGE_KEY, content: pdfFile(), contentType: 'application/pdf' });
    const scope = new AttachmentScopeService(new DataScopeService(), ownership);
    const audit = new RecordingAuditLogger();
    return { useCase: new DownloadAttachmentUseCase(attachments, storage, scope, audit), storage, audit };
  }

  it('CHẶN người dùng phạm vi OWN tải tệp của hồ sơ doanh nghiệp khác', async () => {
    const { useCase } = buildUseCase(makeAttachment());
    const access = makeAccess({ userId: 'user-dn-a' });

    await expect(useCase.execute({ attachmentId: 'att-001', access })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(useCase.execute({ attachmentId: 'att-001', access })).rejects.toThrow(
      /không có quyền truy cập tệp đính kèm của hồ sơ này/,
    );
  });

  it('CHẶN cả khi tệp chưa gắn hồ sơ và không phải do mình tải lên', async () => {
    const { useCase } = buildUseCase(makeAttachment({ dossierId: null }));
    const access = makeAccess({ userId: 'user-dn-a' });

    await expect(useCase.execute({ attachmentId: 'att-001', access })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('CHO PHÉP người tạo hồ sơ tải tệp của chính hồ sơ mình', async () => {
    const { useCase } = buildUseCase(makeAttachment({ dossierId: 'decl-cua-A' }));
    const access = makeAccess({ userId: 'user-dn-a' });

    const result = await useCase.execute({ attachmentId: 'att-001', access });
    expect(result.attachment.id).toBe('att-001');
  });

  it('CHO PHÉP tài khoản được phân công mã số thuế của doanh nghiệp chủ hồ sơ', async () => {
    const { useCase } = buildUseCase(makeAttachment());
    const access = makeAccess({
      userId: 'user-ke-toan',
      assignments: [{ type: AssignmentType.TAX_CODE, value: '5500222222' }],
    });

    const result = await useCase.execute({ attachmentId: 'att-001', access });
    expect(result.attachment.dossierId).toBe('decl-cua-B');
  });

  it('CHO PHÉP người tải lên xem lại tệp của chính mình', async () => {
    const { useCase } = buildUseCase(makeAttachment({ uploadedById: 'user-dn-a', dossierId: null }));
    const access = makeAccess({ userId: 'user-dn-a' });

    await expect(useCase.execute({ attachmentId: 'att-001', access })).resolves.toBeDefined();
  });

  it('CHO PHÉP phạm vi ALL tải mọi tệp', async () => {
    const { useCase } = buildUseCase(makeAttachment());
    const access = makeAccess({
      userId: 'user-admin',
      roles: [{ code: 'SYS_ADMIN', name: 'Quản trị hệ thống', dataScope: DataScopeLevel.ALL }],
    });

    await expect(useCase.execute({ attachmentId: 'att-001', access })).resolves.toBeDefined();
  });

  it('trả 404 khi không có tệp — không lộ tệp có tồn tại hay không', async () => {
    const { useCase } = buildUseCase(null);
    await expect(
      useCase.execute({ attachmentId: 'att-999', access: makeAccess() }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('kiểm phạm vi TRƯỚC khi tiết lộ tệp đã bị xóa mềm', async () => {
    const attachment = makeAttachment();
    attachment.softDelete('user-dn-b');
    const { useCase } = buildUseCase(attachment);

    // Người ngoài phạm vi nhận 403, không nhận được thông tin "đã bị xóa".
    await expect(
      useCase.execute({ attachmentId: 'att-001', access: makeAccess({ userId: 'user-dn-a' }) }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Người trong phạm vi mới thấy đúng lý do.
    await expect(
      useCase.execute({ attachmentId: 'att-001', access: makeAccess({ userId: 'user-dn-b' }) }),
    ).rejects.toThrow(/đã bị xóa/);
  });

  it('trả luồng nội dung khi hợp lệ', async () => {
    const { useCase } = buildUseCase(makeAttachment({ dossierId: 'decl-cua-A' }));
    const result = await useCase.execute({ attachmentId: 'att-001', access: makeAccess({ userId: 'user-dn-a' }) });

    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) chunks.push(Buffer.from(chunk as Buffer));
    expect(Buffer.concat(chunks).subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('ghi nhận nhật ký ATTACHMENT_DOWNLOAD khi tải tệp thành công', async () => {
    const { useCase, audit } = buildUseCase(makeAttachment({ dossierId: 'decl-cua-A' }));
    const access = makeAccess({ userId: 'user-dn-a' });

    await useCase.execute({ attachmentId: 'att-001', access });

    const entry = audit.entries.find((e) => e.action === 'ATTACHMENT_DOWNLOAD');
    expect(entry).toBeDefined();
    expect(entry?.result).toBe('SUCCESS');
    expect(entry?.targetId).toBe('att-001');
    expect(entry?.after).toMatchObject({
      originalName: 'to-khai.pdf',
      dossierId: 'decl-cua-A',
    });
  });

  it('ghi nhận nhật ký ATTACHMENT_DOWNLOAD với kết quả FAILURE khi tệp không tồn tại hoặc lỗi', async () => {
    const { useCase, audit } = buildUseCase(null);

    await expect(
      useCase.execute({ attachmentId: 'att-999', access: makeAccess() }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const entry = audit.entries.find((e) => e.action === 'ATTACHMENT_DOWNLOAD');
    expect(entry).toBeDefined();
    expect(entry?.result).toBe('FAILURE');
    expect(entry?.targetId).toBe('att-999');
  });
});
