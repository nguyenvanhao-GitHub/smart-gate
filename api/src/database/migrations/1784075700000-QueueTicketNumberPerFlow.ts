import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BUG-017 — số thứ tự điều phối **duy nhất theo (ngày, luồng)**, không theo cửa khẩu (F27).
 *
 * Khoá cũ (P4) là `uq_queue_tickets_number` trên `(issued_date, flow, checkpoint, ticket_number)`:
 * dãy số đánh riêng cho từng chốt nên bốn hồ sơ ở bốn cửa khẩu khác nhau cùng nhận số 1, trên bảng
 * điều phối không phân biệt được xe nào. SRS 7.1 định nghĩa `QueueTicket(dossier_id, date, direction,
 * sequence_no)` — khoá là **ngày + chiều**, không có cửa khẩu. Đổi lại cho đúng.
 *
 * | Chỉ mục mới | Bảo đảm |
 * |---|---|
 * | `uq_queue_tickets_number` (issued_date, flow, ticket_number) | Số **không trùng trong ngày** theo mỗi luồng (F27) |
 *
 * ### Vì sao migration này **tự đánh lại số**, khác `GateEventAllowUnique` (dừng khi có trùng)
 *
 * Dữ liệu production đang mang đúng lỗi này (nhiều thẻ cùng số 1), nên tạo thẳng chỉ mục duy nhất
 * chặt hơn sẽ hỏng. Ở đây **đánh lại số không phải xoá dữ liệu**: mỗi nhóm `(ngày, luồng)` được cấp
 * lại dãy `1..N` theo thứ tự thời gian cấp (`issued_at`, rồi `id` để chốt trật tự) — đây chính là
 * việc F27 đòi, không mất bản ghi nào. Trình tự an toàn: **xoá chỉ mục cũ trước** rồi mới UPDATE để
 * không đụng ràng buộc cũ giữa chừng, sau đó tạo chỉ mục mới.
 *
 * `down()` đảo ngược thật chỉ mục (xoá khoá mới, dựng lại khoá cũ theo cửa khẩu) nhưng **không khôi
 * phục được số cũ đã bị trùng** — đó là dữ liệu hỏng, không có gì để khôi phục.
 */
export class QueueTicketNumberPerFlow1784075700000 implements MigrationInterface {
  name = 'QueueTicketNumberPerFlow1784075700000';

  private readonly logger = new Logger('QueueTicketNumberPerFlow');

  private readonly indexName = 'uq_queue_tickets_number';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Bỏ khoá cũ (theo cửa khẩu) để UPDATE đánh lại số không đụng ràng buộc giữa chừng.
    await queryRunner.query(`DROP INDEX IF EXISTS "${this.indexName}"`);

    // 2) Đánh lại số 1..N theo từng (ngày, luồng), thứ tự theo thời điểm cấp. Chỉ ghi những dòng
    //    thực sự đổi số để log phản ánh đúng khối lượng dữ liệu phải sửa.
    const renumbered: Array<{ id: string }> = await queryRunner.query(
      `UPDATE "queue_tickets" AS q
       SET "ticket_number" = r.rn
       FROM (
         SELECT "id",
                ROW_NUMBER() OVER (
                  PARTITION BY "issued_date", "flow" ORDER BY "issued_at", "id"
                ) AS rn
         FROM "queue_tickets"
       ) AS r
       WHERE q."id" = r."id" AND q."ticket_number" <> r.rn
       RETURNING q."id"`,
    );
    if (renumbered.length > 0) {
      this.logger.log(`Đã đánh lại số thứ tự cho ${renumbered.length} thẻ bị trùng theo (ngày, luồng).`);
    }

    // 3) Tạo khoá mới: số duy nhất theo (ngày, luồng), không có cửa khẩu.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${this.indexName}"
       ON "queue_tickets" ("issued_date", "flow", "ticket_number")`,
    );

    await this.verify(queryRunner);
  }

  /** Thiếu chỉ mục là ném lỗi để TypeORM hoàn tác cả giao dịch. */
  private async verify(queryRunner: QueryRunner): Promise<void> {
    const found: Array<{ indexname: string }> = await queryRunner.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      [this.indexName],
    );
    this.logger.log(`Đối chiếu QueueTicketNumberPerFlow: chỉ mục ${found.length}/1.`);
    if (found.length < 1) {
      throw new Error(`Migration QueueTicketNumberPerFlow chưa tạo được chỉ mục "${this.indexName}". Đã hoàn tác toàn bộ.`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "${this.indexName}"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${this.indexName}"
       ON "queue_tickets" ("issued_date", "flow", "checkpoint", "ticket_number")`,
    );
  }
}
