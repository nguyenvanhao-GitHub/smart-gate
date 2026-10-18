import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P4 — điều phối · cổng · kho bãi (F27, F29, F31, F38, F39, F42–F44).
 *
 * Năm bảng **hoàn toàn mới**: `queue_tickets`, `yards`, `parking_slots`, `dispatch_assignments`,
 * `gate_events`. Không đụng tới bảng/cột nào đang có, **không xoá cột `jsonb`** nào (rủi ro R2).
 * Vì không di trú dữ liệu cũ nên không có bước đối chiếu số liệu; phần đối chiếu ở đây là **kiểm
 * lại đủ 5 bảng và 4 chỉ mục duy nhất** đã được tạo, thiếu là dừng để TypeORM hoàn tác.
 *
 * ### Bốn ràng buộc duy nhất — đây là điểm chính của migration này
 *
 * | Chỉ mục | Bảo đảm |
 * |---|---|
 * | `uq_queue_tickets_number` (issued_date, flow, checkpoint, ticket_number) | Số thứ tự **duy nhất theo ngày/luồng/cửa khẩu** (F27) |
 * | `uq_queue_tickets_dossier_active` (dossier_id, issued_date) WHERE status <> 'CANCELLED' | Một hồ sơ chỉ một số còn hiệu lực mỗi ngày |
 * | `uq_dispatch_assignments_active_dossier` (dossier_id) WHERE status = 'ACTIVE' | **Một xe không nằm ở hai vị trí** (F29) |
 * | `uq_dispatch_assignments_active_slot` (yard_id, slot_code) WHERE status = 'ACTIVE' | **Một ô đỗ không chứa hai xe** (F43) |
 *
 * Ba chỉ mục sau là **chỉ mục có điều kiện**: chỉ ràng buộc các dòng đang hiệu lực, nhờ vậy lịch
 * sử vị trí cũ vẫn giữ được nguyên vẹn thay vì phải xoá đi. Đặt ở tầng database chứ không phải
 * trong mã vì hai yêu cầu chạy song song đều đọc thấy "chưa có ai" trước khi ghi.
 *
 * Theo nếp của dự án, các bảng mới **không tạo khoá ngoại** (xem `TypeOrmDeclarationRepository`).
 */
export class P4DispatchGateYard1784074200000 implements MigrationInterface {
  name = 'P4DispatchGateYard1784074200000';

  private readonly logger = new Logger('P4DispatchGateYard');

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createQueueTickets(queryRunner);
    await this.createYards(queryRunner);
    await this.createDispatchAssignments(queryRunner);
    await this.createGateEvents(queryRunner);
    await this.verify(queryRunner);
  }

  // ---------------------------------------------------------------- Số thứ tự (F27)

  private async createQueueTickets(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "queue_tickets" (
        "id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "ticket_number" integer NOT NULL,
        "issued_date" date NOT NULL,
        "flow" character varying(16) NOT NULL,
        "checkpoint" character varying(32) NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'WAITING',
        "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "issued_by_id" uuid,
        CONSTRAINT "PK_queue_tickets" PRIMARY KEY ("id")
      );
    `);

    // F27 — số thứ tự duy nhất theo (ngày, luồng, cửa khẩu).
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_queue_tickets_number"
       ON "queue_tickets" ("issued_date", "flow", "checkpoint", "ticket_number")`,
    );
    // Một hồ sơ chỉ giữ một số còn hiệu lực trong ngày; số đã hủy không chặn cấp lại.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_queue_tickets_dossier_active"
       ON "queue_tickets" ("dossier_id", "issued_date") WHERE "status" <> 'CANCELLED'`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_queue_tickets_dossier" ON "queue_tickets" ("dossier_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_queue_tickets_date" ON "queue_tickets" ("issued_date")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_queue_tickets_status" ON "queue_tickets" ("status")`);
  }

  // ---------------------------------------------------------------- Kho bãi (F42)

  private async createYards(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "yards" (
        "id" uuid NOT NULL,
        "code" character varying(32) NOT NULL,
        "name" character varying(160) NOT NULL,
        "capacity" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_yards" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_yards_code" ON "yards" ("code")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parking_slots" (
        "id" uuid NOT NULL,
        "yard_id" uuid NOT NULL,
        "code" character varying(32) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_parking_slots" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_parking_slots_yard_code" ON "parking_slots" ("yard_id", "code")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_parking_slots_yard" ON "parking_slots" ("yard_id")`);
  }

  // ---------------------------------------------------------------- Điều phối (F29, F31, F43)

  private async createDispatchAssignments(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dispatch_assignments" (
        "id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "gate_code" character varying(32),
        "lane_code" character varying(32),
        "yard_id" uuid,
        "slot_code" character varying(32),
        "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
        "assigned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "released_at" TIMESTAMP WITH TIME ZONE,
        "assigned_by_id" uuid,
        "note" character varying(500),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dispatch_assignments" PRIMARY KEY ("id")
      );
    `);

    // F29 — một xe/hồ sơ chỉ có đúng một vị trí đang hiệu lực.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_dispatch_assignments_active_dossier"
       ON "dispatch_assignments" ("dossier_id") WHERE "status" = 'ACTIVE'`,
    );
    // F43 — một ô đỗ chỉ chứa đúng một xe tại một thời điểm.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_dispatch_assignments_active_slot"
       ON "dispatch_assignments" ("yard_id", "slot_code")
       WHERE "status" = 'ACTIVE' AND "yard_id" IS NOT NULL AND "slot_code" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_dispatch_assignments_dossier" ON "dispatch_assignments" ("dossier_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_dispatch_assignments_yard" ON "dispatch_assignments" ("yard_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_dispatch_assignments_status" ON "dispatch_assignments" ("status")`,
    );
  }

  // ---------------------------------------------------------------- Sự kiện cổng (F38, F39)

  private async createGateEvents(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gate_events" (
        "id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "gate_code" character varying(32) NOT NULL,
        "direction" character varying(16) NOT NULL,
        "decision" character varying(16) NOT NULL,
        "can_open" boolean NOT NULL DEFAULT false,
        "status_color" character varying(16) NOT NULL DEFAULT 'YELLOW',
        "blocking_reasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "checklist" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "note" character varying(500),
        "actor_id" uuid NOT NULL,
        "actor_name" character varying(160),
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_gate_events" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_gate_events_dossier" ON "gate_events" ("dossier_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_gate_events_gate" ON "gate_events" ("gate_code")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_gate_events_occurred_at" ON "gate_events" ("occurred_at")`);
  }

  // ---------------------------------------------------------------- Đối chiếu

  /** Thiếu bảng hay thiếu chỉ mục duy nhất là ném lỗi để TypeORM hoàn tác cả giao dịch. */
  private async verify(queryRunner: QueryRunner): Promise<void> {
    const tables = ['queue_tickets', 'yards', 'parking_slots', 'dispatch_assignments', 'gate_events'];
    const uniqueIndexes = [
      'uq_queue_tickets_number',
      'uq_queue_tickets_dossier_active',
      'uq_dispatch_assignments_active_dossier',
      'uq_dispatch_assignments_active_slot',
    ];

    const foundTables: Array<{ table_name: string }> = await queryRunner.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [tables],
    );
    const foundIndexes: Array<{ indexname: string }> = await queryRunner.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)`,
      [uniqueIndexes],
    );

    const missingTables = tables.filter((name) => !foundTables.some((row) => row.table_name === name));
    const missingIndexes = uniqueIndexes.filter((name) => !foundIndexes.some((row) => row.indexname === name));

    this.logger.log(
      `Đối chiếu P4: bảng ${foundTables.length}/${tables.length} · chỉ mục duy nhất ${foundIndexes.length}/${uniqueIndexes.length}.`,
    );

    if (missingTables.length > 0 || missingIndexes.length > 0) {
      throw new Error(
        `Migration P4 chưa tạo đủ: bảng thiếu [${missingTables.join(', ')}], chỉ mục duy nhất thiếu [${missingIndexes.join(', ')}]. Đã hoàn tác toàn bộ.`,
      );
    }
  }

  // ---------------------------------------------------------------- Hoàn tác

  /**
   * Đảo ngược thật: xoá đúng 5 bảng đã tạo (chỉ mục đi theo bảng). Không có dữ liệu nào của
   * phân hệ khác bị chạm nên `down()` không cần khôi phục gì thêm.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "gate_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dispatch_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parking_slots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "yards"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "queue_tickets"`);
  }
}
