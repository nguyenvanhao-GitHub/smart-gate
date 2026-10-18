import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P10 (BUG-033) — **mỗi phương tiện gắn một lái xe**.
 *
 * Trước đây lái xe là **một** bản ghi cho cả hồ sơ (bảng `drivers`, ràng buộc duy nhất
 * `UQ_drivers_dossier`), nên hồ sơ nhiều xe không truy được ai điều khiển xe nào (SRS F37, bước
 * "Biên phòng - kiểm tra người và phương tiện"). Nay thông tin lái xe được **nhúng thẳng vào từng
 * dòng của bảng `vehicles`** — mỗi xe mang họ tên/giấy tờ/GPLX/quốc tịch riêng.
 *
 * ### Cách di trú (append-only, KHÔNG mất dữ liệu)
 *
 * 1. Thêm 6 cột `driver_*` (đều **nullable**) vào bảng `vehicles`.
 * 2. Sao lái xe cũ (một hồ sơ một bản ghi) sang **mọi phương tiện** của hồ sơ đó
 *    (`UPDATE … FROM "drivers"` khớp theo `dossier_id`).
 * 3. **GIỮ NGUYÊN** bảng `drivers` (không xóa) — dữ liệu cũ còn nguyên vẹn để đối chiếu và để
 *    `down()` hợp lệ mà không phải khôi phục dữ liệu. Repository/mapper nay đọc/ghi lái xe theo từng
 *    xe; bảng `drivers` trở thành dữ liệu lịch sử, không còn được ghi mới.
 *
 * `down()` đảo ngược thật: chỉ **xóa 6 cột** vừa thêm. Dữ liệu lái xe cũ vẫn nằm trong bảng `drivers`
 * nên hoàn tác không mất gì. `migration:check` chạy tiến/lùi/tiến sạch.
 */
export class P10VehicleDriverPerVehicle1784075800000 implements MigrationInterface {
  name = 'P10VehicleDriverPerVehicle1784075800000';

  private readonly logger = new Logger('P10VehicleDriverPerVehicle');

  private readonly columns = [
    'driver_full_name',
    'driver_id_number',
    'driver_id_type',
    'driver_phone',
    'driver_license_number',
    'driver_nationality',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumns(queryRunner);
    await this.backfill(queryRunner);
    await this.verify(queryRunner);
  }

  private async addColumns(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "driver_full_name" character varying(160)`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "driver_id_number" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "driver_id_type" character varying(32)`,
    );
    await queryRunner.query(`ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "driver_phone" character varying(32)`);
    await queryRunner.query(
      `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "driver_license_number" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "driver_nationality" character varying(32)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_vehicles_driver_id_number" ON "vehicles" ("driver_id_number")`,
    );
  }

  /** Sao lái xe cũ (một hồ sơ một bản ghi) sang mọi phương tiện của hồ sơ đó. */
  private async backfill(queryRunner: QueryRunner): Promise<void> {
    const result: unknown = await queryRunner.query(
      `UPDATE "vehicles" AS v SET
         "driver_full_name" = d."full_name",
         "driver_id_number" = d."id_number",
         "driver_id_type" = d."id_type",
         "driver_phone" = d."phone",
         "driver_license_number" = d."license_number",
         "driver_nationality" = d."nationality"
       FROM "drivers" AS d
       WHERE v."dossier_id" = d."dossier_id"`,
    );
    // TypeORM trả `[rows, affected]` cho UPDATE; đọc số dòng đã cập nhật để in nhật ký đối chiếu.
    const affected = Array.isArray(result) ? Number(result[1] ?? 0) : 0;
    this.logger.log(`Đã sao lái xe hồ sơ sang ${affected} dòng phương tiện.`);
  }

  private async verify(queryRunner: QueryRunner): Promise<void> {
    const columns: Array<{ column_name: string }> = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'vehicles' AND column_name = ANY($1)`,
      [this.columns],
    );
    this.logger.log(`Đối chiếu P10: cột lái xe trên "vehicles" ${columns.length}/${this.columns.length}.`);
    if (columns.length < this.columns.length) {
      throw new Error('Migration P10 chưa tạo đủ cột lái xe trên bảng "vehicles". Đã hoàn tác toàn bộ.');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_vehicles_driver_id_number"`);
    for (const column of this.columns) {
      await queryRunner.query(`ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "${column}"`);
    }
  }
}
