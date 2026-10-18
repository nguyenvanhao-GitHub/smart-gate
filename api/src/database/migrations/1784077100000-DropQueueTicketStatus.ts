import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gỡ cột `queue_tickets.status` (WAITING/CALLED/DONE/CANCELLED) — "gọi số" đã rút gọn thành **cấp số
 * thuần** (quyết định chủ dự án): mỗi hồ sơ chỉ được gắn **một số thứ tự duy nhất** để hiển thị trên
 * thẻ ở màn Điều phối, không còn vòng đời hay thao tác gọi. Bảng chưa có dữ liệu thật nên gỡ thẳng.
 *
 * Cột `status` vướng hai chỉ mục, phải xử lý trước khi DROP:
 * - `uq_queue_tickets_dossier_active` là chỉ mục **có điều kiện** `WHERE status <> 'CANCELLED'` → thay
 *   bằng chỉ mục unique **thường** trên `(dossier_id, issued_date)`, giữ đúng luật **một số/hồ sơ/ngày**.
 * - `IDX_queue_tickets_status` chỉ để lọc theo trạng thái → bỏ hẳn.
 *
 * `uq_queue_tickets_number` (issued_date, flow, ticket_number) KHÔNG dính `status` nên giữ nguyên.
 *
 * `down()` dựng lại cột + đúng hai chỉ mục cũ (có điều kiện) để `migration:check` chạy tiến/lùi/tiến
 * sạch. Thêm cột kèm `DEFAULT 'WAITING'` để bảng có sẵn dữ liệu không vi phạm `NOT NULL`, rồi bỏ default.
 */
export class DropQueueTicketStatus1784077100000 implements MigrationInterface {
  name = 'DropQueueTicketStatus1784077100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Bỏ hai chỉ mục tham chiếu `status` trước khi gỡ cột.
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_queue_tickets_dossier_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_queue_tickets_status"`);

    await queryRunner.query(`ALTER TABLE "queue_tickets" DROP COLUMN IF EXISTS "status"`);

    // Một số/hồ sơ/ngày — chỉ mục unique thường thay cho chỉ mục có điều kiện cũ.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_queue_tickets_dossier_active"
       ON "queue_tickets" ("dossier_id", "issued_date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "queue_tickets" ADD COLUMN IF NOT EXISTS "status" character varying(16) NOT NULL DEFAULT 'WAITING'`,
    );
    await queryRunner.query(`ALTER TABLE "queue_tickets" ALTER COLUMN "status" DROP DEFAULT`);

    // Trả lại chỉ mục cũ: unique có điều kiện + chỉ mục lọc theo trạng thái.
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_queue_tickets_dossier_active"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_queue_tickets_dossier_active"
       ON "queue_tickets" ("dossier_id", "issued_date") WHERE "status" <> 'CANCELLED'`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_queue_tickets_status" ON "queue_tickets" ("status")`);
  }
}
