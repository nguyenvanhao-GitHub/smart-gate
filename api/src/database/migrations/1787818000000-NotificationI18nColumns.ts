import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bổ sung các cột i18n cho bảng `notifications`: `title_key`, `title_params`, `content_key`, `content_params`.
 * Đều là nullable để tương thích ngược 100% với dữ liệu thông báo lịch sử.
 */
export class NotificationI18nColumns1787818000000 implements MigrationInterface {
  name = 'NotificationI18nColumns1787818000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "title_key" varchar(100) NULL`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "title_params" jsonb NULL`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "content_key" varchar(100) NULL`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "content_params" jsonb NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "content_params"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "content_key"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "title_params"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "title_key"`);
  }
}
