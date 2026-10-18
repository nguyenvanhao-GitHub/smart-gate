import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bổ sung cột is_protected vào bảng users để bảo vệ các tài khoản hệ thống cốt lõi (Root Admin)
 * khỏi việc bị tước nhầm vai trò Quản trị hoặc bị xóa/khóa tài khoản.
 */
export class UserIsProtected1787819000000 implements MigrationInterface {
  name = 'UserIsProtected1787819000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_protected" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`UPDATE "users" SET "is_protected" = true WHERE "username" = 'admin'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "is_protected"`);
  }
}
