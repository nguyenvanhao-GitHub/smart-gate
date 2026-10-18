import { NotFoundException } from '@nestjs/common';
import { DataScopeService } from '../../../access-control/application/services/data-scope.service';
import { Attachment } from '../../domain/attachment.entity';
import {
  FakeDocumentTypeCatalog,
  FakeDossierOwnership,
  InMemoryAttachmentRepository,
  makeAccess,
} from '../../testing/attachment.fixture';
import { AttachmentScopeService } from '../services/attachment-scope.service';
import { GetAttachmentMetadataUseCase } from './get-attachment-metadata.use-case';

describe('GetAttachmentMetadataUseCase', () => {
  const uploader = 'user-dn-a';

  function makeAttachment(overrides: Partial<Parameters<typeof Attachment.create>[0]> = {}): Attachment {
    return Attachment.create({
      originalName: 'to-khai.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      storageKey: 'attachments/2026/08/x.pdf',
      checksum: 'a'.repeat(64),
      documentTypeCode: 'CUSTOMS_DECLARATION',
      uploadedById: uploader,
      ...overrides,
    });
  }

  function build(attachment: Attachment): GetAttachmentMetadataUseCase {
    const scope = new AttachmentScopeService(new DataScopeService(), new FakeDossierOwnership());
    return new GetAttachmentMetadataUseCase(
      new InMemoryAttachmentRepository([attachment]),
      new FakeDocumentTypeCatalog(),
      scope,
    );
  }

  it('trả metadata theo shape của web kèm tên loại chứng từ', async () => {
    const attachment = makeAttachment();
    const view = await build(attachment).execute(attachment.id, makeAccess({ userId: uploader }));

    expect(view).toEqual({
      id: attachment.id,
      fileName: 'to-khai.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      documentTypeCode: 'CUSTOMS_DECLARATION',
      documentTypeName: 'Tờ khai hải quan',
      uploadedAt: attachment.uploadedAt,
      uploadedBy: uploader,
    });
    // Không lộ trường nội bộ ra ngoài qua API.
    expect(view).not.toHaveProperty('storageKey');
    expect(view).not.toHaveProperty('originalName');
    expect(view).not.toHaveProperty('mimeType');
    expect(view).not.toHaveProperty('checksum');
  });

  it('trả documentTypeName null khi tệp chưa gắn loại chứng từ', async () => {
    const attachment = makeAttachment({ documentTypeCode: null });
    const view = await build(attachment).execute(attachment.id, makeAccess({ userId: uploader }));

    expect(view.documentTypeCode).toBeNull();
    expect(view.documentTypeName).toBeNull();
  });

  it('ném 404 tiếng Việt khi không tìm thấy tệp', async () => {
    const attachment = makeAttachment();
    await expect(
      build(attachment).execute('00000000-0000-0000-0000-000000000000', makeAccess({ userId: uploader })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
