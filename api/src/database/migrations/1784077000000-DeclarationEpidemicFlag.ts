import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CR2 — **cờ ưu tiên kiểm dịch (dịch tễ)** trên hồ sơ.
 *
 * Thêm ba cột (append-only) vào `declarations`:
 * - `epidemic_flag boolean NOT NULL DEFAULT false` — hồ sơ có yêu cầu ưu tiên kiểm dịch hay không;
 * - `epidemic_marked_by uuid NULL` — người đánh dấu (cán bộ Biên phòng tại cổng vào);
 * - `epidemic_marked_at timestamptz NULL` — thời điểm đánh dấu.
 *
 * Cờ bật **một chiều** tại cổng vào (nút "Ưu tiên kiểm dịch"), không có đường gỡ ở ứng dụng — nhưng
 * ở tầng schema vẫn là cột thường để `down()` gỡ được sạch. `down()` DROP đúng ba cột.
 */
export class DeclarationEpidemicFlag1784077000000 implements MigrationInterface {
  name = 'DeclarationEpidemicFlag1784077000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "declarations" ADD COLUMN IF NOT EXISTS "epidemic_flag" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "declarations" ADD COLUMN IF NOT EXISTS "epidemic_marked_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "declarations" ADD COLUMN IF NOT EXISTS "epidemic_marked_at" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "declarations" DROP COLUMN IF EXISTS "epidemic_marked_at"`);
    await queryRunner.query(`ALTER TABLE "declarations" DROP COLUMN IF EXISTS "epidemic_marked_by"`);
    await queryRunner.query(`ALTER TABLE "declarations" DROP COLUMN IF EXISTS "epidemic_flag"`);
  }
}
