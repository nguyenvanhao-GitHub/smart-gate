import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { AttachmentStatus } from '../../domain/attachment-status.enum';

@Entity('attachments')
// Truy vấn nóng nhất: danh sách chứng từ còn hiệu lực của một hồ sơ (tab "Chứng từ" UI-05).
@Index('IDX_attachments_dossier_status', ['dossierId', 'status'])
export class AttachmentOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  /** Null ở bước này: việc tách bảng hồ sơ làm ở lượt sau nên tệp có thể tải lên trước hồ sơ. */
  @Index()
  @Column({ name: 'dossier_id', type: 'uuid', nullable: true })
  dossierId!: string | null;

  @Column({ name: 'original_name', length: 255 })
  originalName!: string;

  @Column({ name: 'mime_type', length: 128 })
  mimeType!: string;

  // Dung lượng tối đa 15 MB nên `integer` (tới ~2 GB) là quá đủ, không cần `bigint` + transformer.
  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes!: number;

  /** Khoá do server sinh. Duy nhất để không có 2 bản ghi cùng trỏ vào một đối tượng lưu trữ. */
  @Index('UQ_attachments_storage_key', { unique: true })
  @Column({ name: 'storage_key', length: 255 })
  storageKey!: string;

  @Index()
  @Column({ name: 'checksum', length: 128 })
  checksum!: string;

  @Column({ name: 'document_type_code', type: 'varchar', length: 64, nullable: true })
  documentTypeCode!: string | null;

  @Index()
  @Column({ name: 'uploaded_by_id', type: 'uuid' })
  uploadedById!: string;

  @CreateDateColumn({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt!: Date;

  @Column({ name: 'status', length: 16, default: AttachmentStatus.ACTIVE })
  status!: AttachmentStatus;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @Column({ name: 'deleted_by_id', type: 'uuid', nullable: true })
  deletedById!: string | null;
}
