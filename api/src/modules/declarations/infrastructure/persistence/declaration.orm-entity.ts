import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { CheckpointCode, DeclarationStatus, DeclarationType } from '../../domain/declaration.enums';

@Entity('declarations')
export class DeclarationOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ length: 32 })
  code!: string;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  type!: DeclarationType;

  /**
   * Lưu dạng `varchar` chứ không phải enum của PostgreSQL (đổi ở migration P3): bảng trạng thái
   * theo Phụ lục A của SRS còn tiếp tục bổ sung, mà `ALTER TYPE ... ADD VALUE` không dùng được
   * giá trị mới trong cùng giao dịch với lệnh di trú dữ liệu.
   */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  status!: DeclarationStatus;

  @Index()
  @Column({ type: 'varchar', length: 32, nullable: true })
  feeDeclarationCode?: string;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  enterpriseTaxCode!: string;

  /** Khóa sang bảng `enterprises` (P2). Null với hồ sơ cũ chưa di trú. */
  @Index()
  @Column({ name: 'enterprise_id', type: 'uuid', nullable: true })
  enterpriseId?: string | null;

  /*
   * Ba cột `jsonb` cũ `enterprise`/`vehicle`/`cargo` **đã bị gỡ** (migration
   * `DropDossierJsonbColumns1784075200000`): bảng quan hệ `enterprises`/`vehicles`/`cargo_items`
   * là nguồn duy nhất, kết thúc giai đoạn ghi-kép (rủi ro R2 đã được chủ dự án chấp nhận gỡ).
   * Cột `jsonb` cũ `forceProgress` cũng **đã bị gỡ** (migration `DropForceProgressColumn1784075500000`):
   * nguồn sự thật của tiến độ liên ngành là bảng `workflow_instances`/`workflow_instance_steps`.
   * Hai cột `jsonb` workflow/nhật ký còn lại (`workflowProgress`/`auditTrail`) là trạng thái sống,
   * KHÔNG có bảng quan hệ thay thế — giữ nguyên.
   */

  @Index()
  @Column({ type: 'varchar', length: 32 })
  plateNumber!: string;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  containerNumber?: string;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  trailerNumber?: string;

  @Column({ type: 'varchar', length: 32, default: CheckpointCode.SMART_GATE })
  checkpoint!: CheckpointCode;

  @Column({ type: 'jsonb', default: {} })
  workflowProgress!: Record<string, unknown>;

  /** Thông tin định danh và liên hệ của người khai (cá nhân, nội bộ, khai hộ) — tách riêng khỏi workflowProgress để tránh rò rỉ PII */
  @Column({ name: 'declarant_account', type: 'jsonb', nullable: true })
  declarantAccount?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', default: [] })
  auditTrail!: Record<string, unknown>[];

  @Index()
  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById?: string;

  /** Thời điểm doanh nghiệp gửi hồ sơ. Null khi hồ sơ còn là nháp. */
  @Index()
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt?: Date | null;

  /** Chuỗi mã QR (F14) — chỉ lưu chuỗi, việc vẽ ảnh do web làm. */
  @Index()
  @Column({ name: 'qr_code', type: 'varchar', length: 128, nullable: true })
  qrCode?: string | null;

  /** CR2 — cờ ưu tiên kiểm dịch (dịch tễ). Bật một chiều tại cổng vào; không có đường gỡ. */
  @Column({ name: 'epidemic_flag', type: 'boolean', default: false })
  epidemicFlag!: boolean;

  @Column({ name: 'epidemic_marked_by', type: 'uuid', nullable: true })
  epidemicMarkedBy?: string | null;

  @Column({ name: 'epidemic_marked_at', type: 'timestamptz', nullable: true })
  epidemicMarkedAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
