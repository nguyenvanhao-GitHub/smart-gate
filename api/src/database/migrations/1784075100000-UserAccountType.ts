import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F00 (SRS UI-01) — thêm loại tài khoản tự đăng ký vào bảng `users`.
 *
 * `account_type` phân biệt tài khoản doanh nghiệp/cá nhân; `tax_code` (mã số thuế) chỉ có ở tài khoản
 * doanh nghiệp; `id_number` (CCCD/hộ chiếu) chỉ có ở tài khoản cá nhân. Cả ba đều **nullable** vì tài
 * khoản do admin tạo (F01) không thuộc loại nào và các tài khoản đã tồn tại trước khi có tính năng này.
 *
 * `account_type` là `varchar(16)` chứ không phải enum PostgreSQL — cùng lối `users.status`/`declarations.status`:
 * giá trị tập đóng được kiểm ở tầng ứng dụng (class-validator `@IsEnum`), không khoá cứng bằng kiểu DB.
 *
 * `IF NOT EXISTS`/`IF EXISTS` để chạy an toàn cả trên schema dev dựng sẵn bằng `synchronize`.
 */
export class UserAccountType1784075100000 implements MigrationInterface {
  name = 'UserAccountType1784075100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "account_type" character varying(16)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tax_code" character varying(32)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "id_number" character varying(32)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "id_number"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "tax_code"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "account_type"`);
  }
}
