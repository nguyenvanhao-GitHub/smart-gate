import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bổ sung cột `avatar_url` (text) vào bảng `users` (SG-85).
 * Lưu ảnh đại diện (URL hoặc chuỗi base64) cho người dùng để đồng bộ trên mọi thiết bị/trình duyệt.
 */
export class UserAvatarUrl1784077200000 implements MigrationInterface {
  name = 'UserAvatarUrl1784077200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "avatar_url"`);
  }
}
