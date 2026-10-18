import { Readable } from 'stream';
import { AuditEntryInput, AuditLogger } from '../../../common/audit/audit-logger.port';
import { UserAccessContext } from '../../../common/auth/access-context';
import { DataScopeLevel } from '../../access-control/domain/data-scope.enum';
import { AttachmentRepository } from '../application/ports/attachment.repository';
import { DocumentTypeCatalogPort } from '../application/ports/document-type-catalog.port';
import { DossierOwnership, DossierOwnershipPort } from '../application/ports/dossier-ownership.port';
import { PutObjectInput, StoragePort, StoredObject } from '../application/ports/storage.port';
import { Attachment } from '../domain/attachment.entity';

/** Bộ dữ liệu và bản giả dựng sẵn cho test — KHÔNG dùng trong mã sản phẩm. */

const SIGNATURE_PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // "%PDF-1.7"
const SIGNATURE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SIGNATURE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const SIGNATURE_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const SIGNATURE_OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const SIGNATURE_EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // "MZ" — tệp thực thi Windows

function withBody(signature: Buffer, body: string, size = 0): Buffer {
  const padding = size > 0 ? Buffer.alloc(Math.max(0, size - signature.length - body.length), 0x41) : Buffer.alloc(0);
  return Buffer.concat([signature, padding, Buffer.from(body, 'latin1')]);
}

export const pdfFile = (size = 0): Buffer => withBody(SIGNATURE_PDF, 'noi dung to khai', size);
export const pngFile = (size = 0): Buffer => withBody(SIGNATURE_PNG, 'IEND', size);
export const jpegFile = (size = 0): Buffer => withBody(SIGNATURE_JPEG, 'JFIF', size);
export const docxFile = (): Buffer => withBody(SIGNATURE_ZIP, '[Content_Types].xml word/document.xml');
export const xlsxFile = (): Buffer => withBody(SIGNATURE_ZIP, '[Content_Types].xml xl/workbook.xml');
/** ZIP thường (không phải OOXML) — phải bị từ chối vì có thể bọc tệp thực thi. */
export const plainZipFile = (): Buffer => withBody(SIGNATURE_ZIP, 'payload/run.sh');
export const legacyOfficeFile = (): Buffer => withBody(SIGNATURE_OLE2, 'Word.Document.8');
export const executableFile = (): Buffer => withBody(SIGNATURE_EXE, 'This program cannot be run in DOS mode');
export const plainTextFile = (): Buffer => Buffer.from('Day chi la van ban thuong', 'utf8');

/** PDF hợp lệ nhưng vượt ngưỡng dung lượng. */
export const oversizedPdfFile = (bytes: number): Buffer =>
  Buffer.concat([SIGNATURE_PDF, Buffer.alloc(bytes - SIGNATURE_PDF.length, 0x41)]);

export function makeAccess(overrides: Partial<UserAccessContext> = {}): UserAccessContext {
  return {
    userId: overrides.userId ?? 'user-dn-a',
    roles: overrides.roles ?? [{ code: 'ENTERPRISE', name: 'Doanh nghiệp', dataScope: DataScopeLevel.OWN }],
    permissions: overrides.permissions ?? ['dossier.view', 'dossier.update'],
    assignments: overrides.assignments ?? [],
  };
}

export class InMemoryAttachmentRepository implements AttachmentRepository {
  readonly rows = new Map<string, Attachment>();

  constructor(seed: Attachment[] = []) {
    seed.forEach((item) => this.rows.set(item.id, item));
  }

  async save(attachment: Attachment): Promise<Attachment> {
    this.rows.set(attachment.id, attachment);
    return attachment;
  }

  async findById(id: string): Promise<Attachment | null> {
    return this.rows.get(id) ?? null;
  }

  async findByDossier(dossierId: string): Promise<Attachment[]> {
    return [...this.rows.values()].filter((item) => item.dossierId === dossierId && !item.isDeleted);
  }
}

export class FakeStorage implements StoragePort {
  readonly objects = new Map<string, PutObjectInput>();
  removed: string[] = [];

  constructor(private readonly configured = true) {}

  isConfigured(): boolean {
    return this.configured;
  }

  async put(input: PutObjectInput): Promise<void> {
    this.objects.set(input.key, input);
  }

  async get(key: string): Promise<StoredObject> {
    const stored = this.objects.get(key);
    if (!stored) throw new Error(`Khong tim thay doi tuong ${key}`);
    return { stream: Readable.from(stored.content), contentType: stored.contentType };
  }

  async remove(key: string): Promise<void> {
    this.removed.push(key);
    this.objects.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }
}

export class FakeDocumentTypeCatalog implements DocumentTypeCatalogPort {
  constructor(
    private readonly usable: string[] = ['CUSTOMS_DECLARATION'],
    private readonly names: Record<string, string> = { CUSTOMS_DECLARATION: 'Tờ khai hải quan' },
  ) {}

  async isUsable(code: string): Promise<boolean> {
    return this.usable.includes(code);
  }

  async nameOf(code: string): Promise<string | null> {
    return this.names[code] ?? null;
  }
}

export class FakeDossierOwnership implements DossierOwnershipPort {
  constructor(private readonly rows: DossierOwnership[] = []) {}

  async findOwnership(dossierId: string): Promise<DossierOwnership | null> {
    return this.rows.find((row) => row.dossierId === dossierId) ?? null;
  }
}

/** Bản ghi nhật ký kiểm toán thu được trong test — dùng để khẳng định upload/xóa đều có audit. */
export class RecordingAuditLogger implements AuditLogger {
  readonly entries: AuditEntryInput[] = [];

  async record(entry: AuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}
