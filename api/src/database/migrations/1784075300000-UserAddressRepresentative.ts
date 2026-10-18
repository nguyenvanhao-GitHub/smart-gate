import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bổ sung địa chỉ liên hệ và người đại diện vào bảng `users` (SRS UI-01/UI-13).
 *
 * `address` là địa chỉ liên hệ của tài khoản tự đăng ký (doanh nghiệp/cá nhân); `representative_name`
 * là người đại diện, chỉ có ở tài khoản doanh nghiệp. Cả hai đều **nullable** vì tài khoản nội bộ do
 * admin tạo (F01) không dùng và các tài khoản tồn tại trước khi có tính năng này chưa có dữ liệu.
 *
 * `IF NOT EXISTS`/`IF EXISTS` để chạy an toàn cả trên schema dev dựng sẵn bằng `synchronize`.
 */
export class UserAddressRepresentative1784075300000 implements MigrationInterface {
  name = 'UserAddressRepresentative1784075300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "representative_name" character varying(160)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "representative_name"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "address"`);
  }
}
