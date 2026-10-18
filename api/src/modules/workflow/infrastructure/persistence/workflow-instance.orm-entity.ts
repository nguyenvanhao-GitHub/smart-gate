import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Phiên xử lý liên ngành của một hồ sơ — thay cột `declarations.workflowProgress` (jsonb).
 * ⚠️ Cột `jsonb` cũ **vẫn được giữ và ghi song song** cho tới khi nghiệm thu P3 (rủi ro R2).
 */
@Entity('workflow_instances')
export class WorkflowInstanceOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @Column({ name: 'dossier_type', length: 32 })
  dossierType!: string;

  @Index()
  @Column({ name: 'current_step_code', type: 'varchar', length: 64, nullable: true })
  currentStepCode!: string | null;

  @Index()
  @Column({ length: 32 })
  status!: string;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
