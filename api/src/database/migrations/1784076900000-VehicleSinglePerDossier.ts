import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * **Đúng một phương tiện/hồ sơ** (CR8) — dọn di sản mô hình đa-xe (P9/P10).
 *
 * Ba việc, append-only:
 * 1. DROP cột `vehicles.line_no` và `vehicles.dossier_active`: hai cột chỉ phục vụ nhiều xe/hồ sơ và
 *    chỉ mục biển số có điều kiện của F09 — cả hai đã bị bỏ (F09 gỡ ở P12, mô hình về một xe).
 * 2. DROP chỉ mục đa-xe `IDX_vehicles_dossier_line` và `IDX_vehicles_dossier` (index thường trên
 *    `dossier_id`), thay bằng **UNIQUE `uq_vehicles_dossier`** — DB đảm bảo mỗi hồ sơ đúng một xe.
 * 3. **KHÔNG** dựng lại chỉ mục trùng biển số: cho phép trùng biển giữa các hồ sơ (đã chốt).
 *
 * DB đã được clear (không dữ liệu thật) nên không cần guard dedup phức tạp: nếu vẫn còn hồ sơ đa xe
 * thì `CREATE UNIQUE INDEX` sẽ tự báo lỗi và dừng — xử lý dữ liệu là quyết định vận hành.
 *
 * `down()` khôi phục cột/chỉ mục cũ (rỗng, `line_no = 1`, `dossier_active = false`) để
 * `migration:check` chạy tiến/lùi/tiến sạch — KHÔNG khôi phục dữ liệu đa-xe (đã bỏ cùng mô hình).
 */
export class VehicleSinglePerDossier1784076900000 implements MigrationInterface {
  name = 'VehicleSinglePerDossier1784076900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_vehicles_dossier_line"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_vehicles_dossier"`);
    await queryRunner.query(`ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "line_no"`);
    await queryRunner.query(`ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "dossier_active"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_vehicles_dossier" ON "vehicles" ("dossier_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_vehicles_dossier"`);
    await queryRunner.query(`ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "line_no" integer NOT NULL DEFAULT 1`);
    await queryRunner.query(
      `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "dossier_active" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_vehicles_dossier" ON "vehicles" ("dossier_id")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_vehicles_dossier_line" ON "vehicles" ("dossier_id", "line_no")`,
    );
  }
}
