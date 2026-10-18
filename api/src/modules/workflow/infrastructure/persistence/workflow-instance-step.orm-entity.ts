import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

/** Một bước trong phiên. `entered_at`/`completed_at` là dữ liệu gốc để đo thời gian xử lý (F26). */
@Entity('workflow_instance_steps')
@Unique('uq_workflow_instance_steps_instance_step', ['instanceId', 'stepCode'])
export class WorkflowInstanceStepOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'instance_id', type: 'uuid' })
  instanceId!: string;

  @Column({ name: 'step_code', length: 64 })
  stepCode!: string;

  @Column({ name: 'step_order', type: 'int', default: 0 })
  stepOrder!: number;

  @Index()
  @Column({ length: 32 })
  status!: string;

  @Column({ name: 'entered_at', type: 'timestamptz', nullable: true })
  enteredAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ name: 'actor_name', type: 'varchar', length: 160, nullable: true })
  actorName!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  decision!: string | null;

  @Column({ name: 'reason_code', type: 'varchar', length: 32, nullable: true })
  reasonCode!: string | null;

  @Column({ name: 'reason_note', type: 'varchar', length: 500, nullable: true })
  reasonNote!: string | null;
}
