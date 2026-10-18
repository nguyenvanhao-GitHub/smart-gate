import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { CATALOG_REPOSITORY, CatalogRepository } from '../../../catalog/application/ports/catalog.repository';
import { AttachmentStatus } from '../../../files/domain/attachment-status.enum';
import { buildStorageKey, fileExtension } from '../../../files/domain/attachment-file.rules';
import { STORAGE_PORT, StoragePort } from '../../../files/application/ports/storage.port';
import { AttachmentOrmEntity } from '../../../files/infrastructure/persistence/attachment.orm-entity';
import {
  DossierAttachmentPort,
  DossierAttachmentView,
} from '../../application/ports/dossier-attachment.port';
import { appBadRequest, appNotFound, appUnavailable } from '../../../../common/i18n';

/** Mã nhóm danh mục loại chứng từ — trùng với `DOCUMENT_TYPE_CATALOG_CODE` của phân hệ `files`. */
const DOCUMENT_TYPE_CATALOG_CODE = 'DOCUMENT_TYPE';

/**
 * Hiện thực `DOSSIER_ATTACHMENTS` trên bảng `attachments` của phân hệ `files`.
 *
 * Đọc thẳng bảng thay vì import `FilesModule` là có chủ ý: `files` đã phụ thuộc `declarations`
 * (qua `DOSSIER_OWNERSHIP`), import ngược lại sẽ tạo vòng phụ thuộc giữa hai module.
 */
@Injectable()
export class TypeOrmDossierAttachmentAdapter implements DossierAttachmentPort {
  constructor(
    @InjectRepository(AttachmentOrmEntity)
    private readonly attachments: Repository<AttachmentOrmEntity>,
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogs: CatalogRepository,
    @Inject(STORAGE_PORT)
    private readonly storage: StoragePort,
  ) {}

  async listByDossier(dossierId: string): Promise<DossierAttachmentView[]> {
    const rows = await this.attachments.find({
      where: { dossierId, status: AttachmentStatus.ACTIVE },
      order: { uploadedAt: 'ASC' },
    });
    return this.toViews(rows);
  }

  async attach(dossierId: string, attachmentIds: string[]): Promise<DossierAttachmentView[]> {
    const rows = await this.attachments.find({ where: { id: In(attachmentIds) } });

    const missing = attachmentIds.filter((id) => !rows.some((row) => row.id === id));
    if (missing.length > 0) {
      throw appNotFound('dossier.attachmentMissing', { codes: missing.join(', ') });
    }
    const deleted = rows.filter((row) => row.status !== AttachmentStatus.ACTIVE);
    if (deleted.length > 0) {
      throw appBadRequest('dossier.attachmentDeleted');
    }
    const takenByOthers = rows.filter((row) => row.dossierId && row.dossierId !== dossierId);
    if (takenByOthers.length > 0) {
      throw appBadRequest('dossier.attachmentOwnedByOther');
    }

    rows.forEach((row) => {
      row.dossierId = dossierId;
    });
    await this.attachments.save(rows);
    return this.listByDossier(dossierId);
  }

  async detach(dossierId: string, attachmentId: string): Promise<void> {
    const row = await this.attachments.findOne({ where: { id: attachmentId } });
    if (!row || row.dossierId !== dossierId) {
      throw appNotFound('dossier.attachmentNotInDossier');
    }
    // Chỉ bỏ liên kết; tệp vẫn còn để doanh nghiệp gắn lại hoặc khôi phục khi thao tác nhầm.
    row.dossierId = null;
    await this.attachments.save(row);
  }

  async cloneToDossier(
    sourceDossierId: string,
    targetDossierId: string,
    actorId: string,
  ): Promise<DossierAttachmentView[]> {
    const rows = await this.attachments.find({
      where: { dossierId: sourceDossierId, status: AttachmentStatus.ACTIVE },
      order: { uploadedAt: 'ASC' },
    });
    if (rows.length === 0) return [];
    // Có tệp để chép nhưng kho lưu trữ chưa cấu hình → không thể nhân bản đối tượng, dừng có kiểm soát
    // thay vì để lỗi kỹ thuật của SDK lộ ra. (Hồ sơ không có tệp thì nhánh trên đã trả sớm.)
    if (!this.storage.isConfigured()) {
      throw appUnavailable('dossier.copyAttachmentUnavailable');
    }

    const clones: AttachmentOrmEntity[] = [];
    for (const row of rows) {
      // Ràng buộc UNIQUE trên `storage_key`: mỗi bản ghi phải trỏ vào một đối tượng riêng. Sao chép
      // nội dung sang khoá mới (server sinh) rồi tạo bản ghi mới — nội dung, checksum, loại chứng từ
      // giữ nguyên nên vẫn là cùng một tệp về mặt dữ liệu.
      const content = await this.readObject(row.storageKey);
      const storageKey = buildStorageKey(fileExtension(row.storageKey));
      await this.storage.put({
        key: storageKey,
        content,
        contentType: row.mimeType,
        checksum: row.checksum,
      });

      const clone = new AttachmentOrmEntity();
      clone.id = randomUUID();
      clone.dossierId = targetDossierId;
      clone.originalName = row.originalName;
      clone.mimeType = row.mimeType;
      clone.sizeBytes = row.sizeBytes;
      clone.storageKey = storageKey;
      clone.checksum = row.checksum;
      clone.documentTypeCode = row.documentTypeCode;
      clone.uploadedById = actorId;
      clone.uploadedAt = new Date();
      clone.status = AttachmentStatus.ACTIVE;
      clone.deletedAt = null;
      clone.deletedById = null;
      clones.push(clone);
    }
    await this.attachments.save(clones);
    return this.listByDossier(targetDossierId);
  }

  /** Đọc trọn nội dung một đối tượng lưu trữ vào bộ nhớ (tệp bị chặn ở 15 MB nên an toàn). */
  private async readObject(key: string): Promise<Buffer> {
    const object = await this.storage.get(key);
    const chunks: Buffer[] = [];
    for await (const chunk of object.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }

  private async toViews(rows: AttachmentOrmEntity[]): Promise<DossierAttachmentView[]> {
    const names = await this.documentTypeNames(rows);
    return rows.map((row) => ({
      id: row.id,
      fileName: row.originalName,
      contentType: row.mimeType,
      sizeBytes: Number(row.sizeBytes),
      documentTypeCode: row.documentTypeCode,
      documentTypeName: row.documentTypeCode ? names.get(row.documentTypeCode) ?? null : null,
      uploadedAt: row.uploadedAt,
      uploadedBy: row.uploadedById,
    }));
  }

  private async documentTypeNames(rows: AttachmentOrmEntity[]): Promise<Map<string, string>> {
    const codes = [...new Set(rows.map((row) => row.documentTypeCode).filter((code): code is string => !!code))];
    const entries = await Promise.all(
      codes.map(async (code) => {
        const item = await this.catalogs.findItemByCode(DOCUMENT_TYPE_CATALOG_CODE, code);
        return [code, item?.name] as const;
      }),
    );
    return new Map(entries.filter((entry): entry is readonly [string, string] => !!entry[1]));
  }
}
