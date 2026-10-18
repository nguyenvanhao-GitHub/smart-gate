import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Batch B — dọn các trường/cột nghiệp vụ đã bỏ theo CR hiệu chỉnh (họp 07/08/2026):
 *
 * | Cột DROP | Bảng | CR |
 * |---|---|---|
 * | `customsDeclarationNumber` | `declarations` | CR5 — bỏ số tờ khai hải quan |
 * | `hs_code` | `cargo_items` | CR13 — bỏ mã HS |
 * | `quarantine_types` | `cargo_items` | CR15 — DN không còn khai loại kiểm dịch |
 * | `time_slot_code` + `slot_date` | `appointments` | CR11 — bỏ hẳn khung giờ + sức chứa (F28) |
 *
 * Được phép DROP vì DB đang được clear, chưa có dữ liệu thật (chủ dự án chốt). `inspection_status`/
 * `inspection_updated_at` (cũng do P6 thêm nhưng phục vụ F44 kiểm tra tại bãi) **giữ nguyên**.
 *
 * `down()` dựng lại đúng khuôn cột + chỉ mục cũ (BaselineSchema, P2DossierRelationalTables, P6) để
 * `migration:check` chạy tiến/lùi/tiến sạch. Không khôi phục dữ liệu vì các cột bị xóa là rỗng.
 */
export class DropDossierLegacyFieldsAndTimeSlot1784076600000 implements MigrationInterface {
  name = 'DropDossierLegacyFieldsAndTimeSlot1784076600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // CR5 — số tờ khai hải quan.
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_declarations_customs_number"`);
    await queryRunner.query(`ALTER TABLE "declarations" DROP COLUMN IF EXISTS "customsDeclarationNumber"`);

    // CR13/CR15 — mã HS và loại kiểm dịch trên dòng hàng.
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cargo_items_hs_code"`);
    await queryRunner.query(`ALTER TABLE "cargo_items" DROP COLUMN IF EXISTS "hs_code"`);
    await queryRunner.query(`ALTER TABLE "cargo_items" DROP COLUMN IF EXISTS "quarantine_types"`);

    // CR11 — khung giờ tiếp nhận + ngày đặt (sức chứa F28).
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_appointments_time_slot"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN IF EXISTS "time_slot_code"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN IF EXISTS "slot_date"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "declarations" ADD COLUMN IF NOT EXISTS "customsDeclarationNumber" character varying(64)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_declarations_customs_number" ON "declarations" ("customsDeclarationNumber")`,
    );

    await queryRunner.query(`ALTER TABLE "cargo_items" ADD COLUMN IF NOT EXISTS "hs_code" character varying(32)`);
    await queryRunner.query(`ALTER TABLE "cargo_items" ADD COLUMN IF NOT EXISTS "quarantine_types" jsonb`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cargo_items_hs_code" ON "cargo_items" ("hs_code")`);

    await queryRunner.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "time_slot_code" character varying(32)`);
    await queryRunner.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "slot_date" date`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_appointments_time_slot" ON "appointments" ("time_slot_code", "slot_date")`,
    );
  }
}
