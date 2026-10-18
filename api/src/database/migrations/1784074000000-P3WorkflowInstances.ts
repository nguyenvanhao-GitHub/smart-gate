import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { WORKFLOW_STEP_ROLE_CATALOG } from '../../modules/access-control/domain/workflow-step-role.catalog';
import { DeclarationStatus } from '../../modules/declarations/domain/declaration.enums';
import {
  InstancePlan,
  LegacyWorkflowRow,
  StepOrderRow,
  buildInstancePlan,
  computeWorkflowExpectation,
} from './support/workflow-progress-backfill';

/**
 * P3 — tách tiến trình liên ngành khỏi cột `jsonb` thành bảng quan hệ.
 *
 * Bảng mới: `workflow_instances`, `workflow_instance_steps`, `agency_actions`, `dossier_notes`,
 * `workflow_checklist_states`.
 *
 * ⚠️ RÀNG BUỘC BẮT BUỘC (rủi ro **R2**, giống hệt migration P2): migration này **KHÔNG XOÁ** cột
 * `declarations.workflowProgress` (jsonb) cũng như bất kỳ cột `jsonb` nào khác. Hai nguồn được giữ
 * song song cho tới khi nghiệm thu P3; use-case ghi cả hai. Việc gỡ cột `jsonb` phải là một
 * migration riêng, chạy sau khi có biên bản nghiệm thu.
 *
 * Cột `declarations.status` được đổi từ kiểu enum của PostgreSQL sang `varchar(32)`. Lý do kỹ thuật:
 * `ALTER TYPE ... ADD VALUE` **không dùng được giá trị mới trong cùng giao dịch**, mà migration của
 * TypeORM chạy trong một giao dịch — nên việc thêm `WAITING_*`/`READY_FOR_EXIT`/`EXITED` theo Phụ
 * lục A của SRS sẽ không thể vừa thêm vừa di trú dữ liệu. Dùng `varchar` còn khiến các trạng thái
 * bổ sung sau này không phải đụng schema nữa.
 *
 * Sau khi đổ dữ liệu, migration **đối chiếu số lượng nguồn với đích**; lệch là ném lỗi để TypeORM
 * hoàn tác toàn bộ giao dịch chứ không âm thầm đi tiếp.
 */
export class P3WorkflowInstances1784074000000 implements MigrationInterface {
  name = 'P3WorkflowInstances1784074000000';

  private readonly logger = new Logger('P3WorkflowInstances');

  private readonly batchSize = 200;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createTables(queryRunner);
    await this.relaxDeclarationStatus(queryRunner);
    await this.backfill(queryRunner);
  }

  // ---------------------------------------------------------------- Schema

  private async createTables(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_instances" (
        "id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "dossier_type" character varying(32) NOT NULL,
        "current_step_code" character varying(64),
        "status" character varying(32) NOT NULL DEFAULT 'IN_PROGRESS',
        "priority" character varying(16) NOT NULL DEFAULT 'NORMAL',
        "started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_instances" PRIMARY KEY ("id")
      );
    `);
    // Mỗi hồ sơ đúng một phiên: đây là ràng buộc chống tạo trùng khi hai người cùng mở màn hình.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_workflow_instances_dossier" ON "workflow_instances" ("dossier_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_instances_step" ON "workflow_instances" ("current_step_code")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_workflow_instances_status" ON "workflow_instances" ("status")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_instances_priority" ON "workflow_instances" ("priority")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_instance_steps" (
        "id" uuid NOT NULL,
        "instance_id" uuid NOT NULL,
        "step_code" character varying(64) NOT NULL,
        "step_order" integer NOT NULL DEFAULT 0,
        "status" character varying(32) NOT NULL DEFAULT 'PENDING',
        "entered_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "actor_id" uuid,
        "actor_name" character varying(160),
        "decision" character varying(32),
        "reason_code" character varying(32),
        "reason_note" character varying(500),
        CONSTRAINT "PK_workflow_instance_steps" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_workflow_instance_steps_instance_step" ON "workflow_instance_steps" ("instance_id", "step_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_instance_steps_instance" ON "workflow_instance_steps" ("instance_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_instance_steps_status" ON "workflow_instance_steps" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agency_actions" (
        "id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "instance_id" uuid NOT NULL,
        "step_code" character varying(64) NOT NULL,
        "agency_code" character varying(32),
        "actor_id" uuid NOT NULL,
        "actor_name" character varying(160),
        "decision" character varying(32) NOT NULL,
        "reason_code" character varying(32),
        "reason_note" character varying(500),
        "elapsed_seconds" integer NOT NULL DEFAULT 0,
        "acted_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_agency_actions" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agency_actions_dossier" ON "agency_actions" ("dossier_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agency_actions_instance" ON "agency_actions" ("instance_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agency_actions_actor" ON "agency_actions" ("actor_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agency_actions_step" ON "agency_actions" ("step_code")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agency_actions_agency" ON "agency_actions" ("agency_code")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agency_actions_acted_at" ON "agency_actions" ("acted_at")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dossier_notes" (
        "id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "actor_id" uuid NOT NULL,
        "actor_name" character varying(160),
        "agency_code" character varying(32),
        "content" character varying(2000) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dossier_notes" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_dossier_notes_dossier" ON "dossier_notes" ("dossier_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_dossier_notes_actor" ON "dossier_notes" ("actor_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_dossier_notes_created_at" ON "dossier_notes" ("created_at")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_checklist_states" (
        "id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "code" character varying(64) NOT NULL,
        "checked" boolean NOT NULL DEFAULT false,
        "note" character varying(500),
        "updated_by_id" uuid,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_checklist_states" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_workflow_checklist_states_dossier_code" ON "workflow_checklist_states" ("dossier_id", "code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_checklist_states_dossier" ON "workflow_checklist_states" ("dossier_id")`,
    );
  }

  /** Đổi `declarations.status` sang varchar để bổ sung trạng thái theo Phụ lục A của SRS. */
  private async relaxDeclarationStatus(queryRunner: QueryRunner): Promise<void> {
    const columns: Array<{ data_type: string }> = await queryRunner.query(
      `SELECT data_type FROM information_schema.columns WHERE table_name = 'declarations' AND column_name = 'status'`,
    );
    if (columns[0]?.data_type !== 'USER-DEFINED') {
      this.logger.log('Cột "declarations"."status" đã là kiểu văn bản — bỏ qua bước đổi kiểu.');
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "declarations" ALTER COLUMN "status" TYPE character varying(32) USING "status"::text`,
    );
    // Kiểu enum cũ chỉ xoá được khi không còn cột nào dùng; `IF EXISTS` để chạy lại vẫn an toàn.
    await queryRunner.query(`DROP TYPE IF EXISTS "declarations_status_enum"`);
    this.logger.log('Đã đổi "declarations"."status" từ enum sang varchar(32) để nhận trạng thái WAITING_*/READY_FOR_EXIT/EXITED.');
  }

  // ---------------------------------------------------------------- Di trú dữ liệu

  private async backfill(queryRunner: QueryRunner): Promise<void> {
    const rows: LegacyWorkflowRow[] = await queryRunner.query(`
      SELECT "id", "type", "status", "workflowProgress", "auditTrail",
             "submitted_at" AS "submittedAt", "createdAt"
      FROM "declarations"
      ORDER BY "createdAt" ASC
    `);

    if (rows.length === 0) {
      this.logger.log('Không có hồ sơ nào trong bảng "declarations" — bỏ qua bước dựng phiên xử lý.');
      return;
    }

    const stepOrders = await this.loadStepOrders(queryRunner);
    const expected = computeWorkflowExpectation(rows, stepOrders);
    const plans = rows
      .map((row) => buildInstancePlan(row, stepOrders))
      .filter((plan): plan is InstancePlan => !!plan);

    await this.insertInstances(queryRunner, plans);
    await this.reconcile(queryRunner, expected);
  }

  /**
   * Thứ tự bước lấy từ bảng `workflow_step_roles`. Bảng rỗng (database chưa chạy seed lần nào) thì
   * lùi về danh mục seed — cố ý **không** ghi vào bảng ở đây, việc seed thuộc `AccessControlSeedService`.
   */
  private async loadStepOrders(queryRunner: QueryRunner): Promise<StepOrderRow[]> {
    const exists: Array<{ exists: boolean }> = await queryRunner.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workflow_step_roles') AS exists`,
    );
    if (exists[0]?.exists) {
      const rows: Array<{ step_code: string; sort_order: number }> = await queryRunner.query(
        `SELECT "step_code", "sort_order" FROM "workflow_step_roles" WHERE "is_active" = true`,
      );
      if (rows.length > 0) {
        return rows.map((row) => ({ stepCode: row.step_code, sortOrder: Number(row.sort_order) }));
      }
    }
    this.logger.warn('Bảng "workflow_step_roles" chưa có dữ liệu — dùng tạm danh mục seed để dựng thứ tự bước.');
    return WORKFLOW_STEP_ROLE_CATALOG.map((item) => ({ stepCode: item.stepCode, sortOrder: item.sortOrder }));
  }

  private async insertInstances(queryRunner: QueryRunner, plans: InstancePlan[]): Promise<void> {
    const withIds = plans.map((plan) => ({ plan, instanceId: randomUUID() }));

    for (const chunk of this.chunk(withIds)) {
      const params: unknown[] = [];
      const values = chunk
        .map(({ plan, instanceId }) => {
          const base = params.length;
          params.push(
            instanceId,
            plan.dossierId,
            plan.dossierType,
            plan.currentStepCode,
            plan.status,
            plan.startedAt.toISOString(),
            plan.completedAt ? plan.completedAt.toISOString() : null,
          );
          return `($${base + 1}::uuid, $${base + 2}::uuid, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::timestamptz, $${base + 7}::timestamptz)`;
        })
        .join(', ');
      await queryRunner.query(
        `INSERT INTO "workflow_instances" ("id", "dossier_id", "dossier_type", "current_step_code", "status", "started_at", "completed_at")
         VALUES ${values}
         ON CONFLICT ("dossier_id") DO NOTHING`,
        params,
      );
    }

    // Đọc lại id thật: hồ sơ đã có phiên từ trước sẽ không bị ghi đè bởi ON CONFLICT DO NOTHING.
    const stored: Array<{ id: string; dossier_id: string }> = await queryRunner.query(
      `SELECT "id", "dossier_id" FROM "workflow_instances"`,
    );
    const instanceIdByDossier = new Map(stored.map((row) => [row.dossier_id, row.id]));

    const steps = plans.flatMap((plan) => {
      const instanceId = instanceIdByDossier.get(plan.dossierId);
      return instanceId ? plan.steps.map((step) => ({ instanceId, step })) : [];
    });

    for (const chunk of this.chunk(steps)) {
      const params: unknown[] = [];
      const values = chunk
        .map(({ instanceId, step }) => {
          const base = params.length;
          params.push(
            randomUUID(),
            instanceId,
            step.stepCode,
            step.order,
            step.status,
            step.enteredAt ? step.enteredAt.toISOString() : null,
            step.completedAt ? step.completedAt.toISOString() : null,
          );
          return `($${base + 1}::uuid, $${base + 2}::uuid, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::timestamptz, $${base + 7}::timestamptz)`;
        })
        .join(', ');
      await queryRunner.query(
        `INSERT INTO "workflow_instance_steps" ("id", "instance_id", "step_code", "step_order", "status", "entered_at", "completed_at")
         VALUES ${values}
         ON CONFLICT ("instance_id", "step_code") DO NOTHING`,
        params,
      );
    }
  }

  /** Đối chiếu nguồn ↔ đích. Lệch là dừng migration để không âm thầm mất dữ liệu. */
  private async reconcile(
    queryRunner: QueryRunner,
    expected: ReturnType<typeof computeWorkflowExpectation>,
  ): Promise<void> {
    const actual = {
      instances: await this.countScalar(queryRunner, `SELECT COUNT(*)::int AS count FROM "workflow_instances"`),
      steps: await this.countScalar(queryRunner, `SELECT COUNT(*)::int AS count FROM "workflow_instance_steps"`),
      completed: await this.countScalar(
        queryRunner,
        `SELECT COUNT(*)::int AS count FROM "workflow_instances" WHERE "status" = 'COMPLETED'`,
      ),
    };

    this.logger.log(
      [
        'Đối chiếu di trú workflowProgress (jsonb) → bảng quan hệ:',
        `hồ sơ nguồn = ${expected.dossiers}`,
        `phiên xử lý: cần ${expected.instances} / có ${actual.instances}`,
        `bước xử lý: cần ${expected.steps} / có ${actual.steps}`,
        `phiên đã hoàn tất: cần ${expected.completed} / có ${actual.completed}`,
        `hồ sơ nháp/đã hủy cố ý không tạo phiên = ${expected.skipped}`,
      ].join(' · '),
    );

    const mismatches: string[] = [];
    if (actual.instances < expected.instances) mismatches.push('phiên xử lý');
    if (actual.steps < expected.steps) mismatches.push('bước xử lý');

    if (mismatches.length > 0) {
      throw new Error(
        `Di trú tiến trình liên ngành bị thiếu ở: ${mismatches.join(', ')}. Migration dừng lại và hoàn tác toàn bộ; cột "workflowProgress" (jsonb) vẫn nguyên vẹn.`,
      );
    }
  }

  private async countScalar(queryRunner: QueryRunner, sql: string): Promise<number> {
    const result: Array<{ count: number | string }> = await queryRunner.query(sql);
    return Number(result[0]?.count ?? 0);
  }

  private chunk<T>(items: T[]): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += this.batchSize) {
      chunks.push(items.slice(index, index + this.batchSize));
    }
    return chunks;
  }

  // ---------------------------------------------------------------- Hoàn tác

  /**
   * Đảo ngược thật: xoá 5 bảng mới và trả `declarations.status` về kiểu enum cũ.
   * Không mất dữ liệu nghiệp vụ vì tiến trình vẫn còn nguyên trong cột `workflowProgress` (jsonb) —
   * đó chính là lý do `up()` không được phép xoá nó.
   *
   * Các trạng thái mới của P3 được quy về giá trị cũ tương đương **trước** khi ép kiểu, nếu không
   * lệnh `USING ... ::declarations_status_enum` sẽ hỏng ngay dòng đầu tiên.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_checklist_states"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dossier_notes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agency_actions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_instance_steps"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_instances"`);

    await queryRunner.query(
      `UPDATE "declarations" SET "status" = '${DeclarationStatus.PROCESSING}'
       WHERE "status" IN ('WAITING_BORDER_GUARD','WAITING_CUSTOMS','WAITING_QUARANTINE','WAITING_INSURANCE','WAITING_GATE','READY_FOR_EXIT')`,
    );
    await queryRunner.query(
      `UPDATE "declarations" SET "status" = '${DeclarationStatus.COMPLETED}' WHERE "status" = 'EXITED'`,
    );

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "declarations_status_enum" AS ENUM (
          'DRAFT','SUBMITTED','PROCESSING','REVISION_REQUIRED','WAITING_FOR_FEE','PAID','COMPLETED','REJECTED','CANCELLED'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "declarations" ALTER COLUMN "status" TYPE "declarations_status_enum" USING "status"::"declarations_status_enum"`,
    );
  }
}
