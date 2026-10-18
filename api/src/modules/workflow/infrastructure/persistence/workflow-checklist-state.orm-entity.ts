import { Column, Entity, Index, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * Trạng thái tích của từng mục kiểm tra trên một hồ sơ.
 * Nhãn và tính bắt buộc **không** ở đây — chúng nằm trong danh mục `WORKFLOW_CHECKLIST` để sửa
 * được qua màn hình quản trị.
 */
@Entity('workflow_checklist_states')
@Unique('uq_workflow_checklist_states_dossier_code', ['dossierId', 'code'])
export class WorkflowChecklistStateOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @Column({ length: 64 })
  code!: string;

  @Column({ type: 'boolean', default: false })
  checked!: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;

  @Column({ name: 'updated_by_id', type: 'uuid', nullable: true })
  updatedById!: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
