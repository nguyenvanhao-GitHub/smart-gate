import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bổ sung trường `cargo_type_code` (Mã loại hàng hóa) cho dòng hàng `cargo_items`.
 * Phục vụ chọn dropdown loại hàng hóa (danh mục CARGO_TYPE) khi khai báo hồ sơ.
 */
export class CargoItemCargoTypeCode1784076100000 implements MigrationInterface {
  name = 'CargoItemCargoTypeCode1784076100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cargo_items" ADD COLUMN IF NOT EXISTS "cargo_type_code" character varying(32)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cargo_items" DROP COLUMN IF EXISTS "cargo_type_code"`);
  }
}
