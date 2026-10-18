import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đánh số thứ tự điều phối **duy nhất theo ngày (issued_date, ticket_number)**, không phân biệt luồng ENTRY/EXIT.
 *
 * Chỉ mục cũ `uq_queue_tickets_number` gồm `(issued_date, flow, ticket_number)` làm cho hồ sơ IMPORT và
 * EXPORT cùng tạo trong ngày đều nhận số 1 (`dd/mm/yyyy.0001`).
 * Đổi lại chỉ mục duy nhất thành `(issued_date, ticket_number)` để mọi xe vào cửa khẩu trong ngày đều
 * có số thứ tự tăng dần duy nhất (1, 2, 3...).
 */
export class QueueTicketNumberPerDate1784077400000 implements MigrationInterface {
  name = 'QueueTicketNumberPerDate1784077400000';

  private readonly logger = new Logger('QueueTicketNumberPerDate');

  private readonly indexName = 'uq_queue_tickets_number';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Bỏ khoá cũ (theo ngày + luồng).
    await queryRunner.query(`DROP INDEX IF EXISTS "${this.indexName}"`);

    // 2) Đánh lại số 1..N theo từng ngày, thứ tự theo thời điểm cấp (issued_at, id).
    const renumbered: Array<{ id: string }> = await queryRunner.query(
      `UPDATE "queue_tickets" AS q
       SET "ticket_number" = r.rn
       FROM (
         SELECT "id",
                ROW_NUMBER() OVER (
                  PARTITION BY "issued_date" ORDER BY "issued_at", "id"
                ) AS rn
         FROM "queue_tickets"
       ) AS r
       WHERE q."id" = r."id" AND q."ticket_number" <> r.rn
       RETURNING q."id"`,
    );

    if (renumbered.length > 0) {
      this.logger.log(`Đã đánh lại ${renumbered.length} số thứ tự theo ngày để loại bỏ lặp số giữa các luồng.`);
    }

    // 3) Tạo chỉ mục duy nhất mới theo (issued_date, ticket_number).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "${this.indexName}" ON "queue_tickets" ("issued_date", "ticket_number")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "${this.indexName}"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "${this.indexName}" ON "queue_tickets" ("issued_date", "flow", "ticket_number")`,
    );
  }
}
