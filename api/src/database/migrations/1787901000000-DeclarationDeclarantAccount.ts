import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tách biệt thông tin tài khoản người khai (cá nhân, nội bộ, khai hộ) sang cột riêng `declarant_account` (jsonb),
 * hoàn toàn độc lập với `workflowProgress` (tránh rò rỉ PII khi đọc trạng thái luồng nghiệp vụ).
 */
export class DeclarationDeclarantAccount1787901000000 implements MigrationInterface {
  name = 'DeclarationDeclarantAccount1787901000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "declarations" ADD COLUMN IF NOT EXISTS "declarant_account" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "declarations" DROP COLUMN IF EXISTS "declarant_account"`);
  }
}
