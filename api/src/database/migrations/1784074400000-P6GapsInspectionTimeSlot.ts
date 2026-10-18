import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ba khoảng trống MVP đợt rà soát 6b (2026-07-24).
 *
 * **Chỉ THÊM cột và chỉ mục, không xoá/không đổi cột nào** (rủi ro R2). Hai nhóm thay đổi:
 *
 * | Cột thêm | Bảng | Phục vụ |
 * |---|---|---|
 * | `inspection_status` + `inspection_updated_at` | `dispatch_assignments` | Vòng đời kiểm tra/tập kết ở bãi (F44) |
 * | `time_slot_code` + `slot_date` | `appointments` | Khung giờ + kiểm soát sức chứa (F28) |
 *
 * `inspection_status` có `DEFAULT 'WAITING_INSPECTION'` nên các lượt đỗ đang có tự nhận trạng thái
 * "chờ kiểm tra" mà không cần backfill. Sức chứa khung giờ (F28) được bảo đảm bằng **khóa hàng
 * `SELECT … FOR UPDATE` trên bản ghi danh mục `TIME_SLOT`** ở tầng use-case/repository, không phải
 * bằng ràng buộc ở đây — vì sức chứa có thể > 1 nên không dùng được chỉ mục duy nhất. Chỉ mục
 * `IDX_appointments_time_slot` chỉ để đếm nhanh theo (khung giờ, ngày).
 *
 * `down()` đảo ngược thật: xoá đúng bốn cột đã thêm (chỉ mục đi theo cột).
 */
export class P6GapsInspectionTimeSlot1784074400000 implements MigrationInterface {
  name = 'P6GapsInspectionTimeSlot1784074400000';

  private readonly logger = new Logger('P6GapsInspectionTimeSlot');

  private readonly columns = [
    { table: 'dispatch_assignments', column: 'inspection_status' },
    { table: 'dispatch_assignments', column: 'inspection_updated_at' },
    { table: 'appointments', column: 'time_slot_code' },
    { table: 'appointments', column: 'slot_date' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // F44 — trạng thái kiểm tra/tập kết của lượt đỗ.
    await queryRunner.query(
      `ALTER TABLE "dispatch_assignments"
         ADD COLUMN IF NOT EXISTS "inspection_status" character varying(32) NOT NULL DEFAULT 'WAITING_INSPECTION'`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_assignments"
         ADD COLUMN IF NOT EXISTS "inspection_updated_at" TIMESTAMP WITH TIME ZONE`,
    );

    // F28 — khung giờ tiếp nhận và ngày đặt (khóa đếm sức chứa).
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "time_slot_code" character varying(32)`,
    );
    await queryRunner.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "slot_date" date`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_appointments_time_slot" ON "appointments" ("time_slot_code", "slot_date")`,
    );

    await this.verify(queryRunner);
  }

  /** Thiếu cột nào là ném lỗi để TypeORM hoàn tác cả giao dịch. */
  private async verify(queryRunner: QueryRunner): Promise<void> {
    const found: Array<{ table_name: string; column_name: string }> = await queryRunner.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (table_name = 'dispatch_assignments' OR table_name = 'appointments')`,
    );
    const missing = this.columns.filter(
      (item) => !found.some((row) => row.table_name === item.table && row.column_name === item.column),
    );

    this.logger.log(`Đối chiếu P6: cột ${this.columns.length - missing.length}/${this.columns.length}.`);

    if (missing.length > 0) {
      throw new Error(
        `Migration P6 chưa thêm đủ cột: [${missing.map((item) => `${item.table}.${item.column}`).join(', ')}]. Đã hoàn tác toàn bộ.`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_appointments_time_slot"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN IF EXISTS "slot_date"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN IF EXISTS "time_slot_code"`);
    await queryRunner.query(`ALTER TABLE "dispatch_assignments" DROP COLUMN IF EXISTS "inspection_updated_at"`);
    await queryRunner.query(`ALTER TABLE "dispatch_assignments" DROP COLUMN IF EXISTS "inspection_status"`);
  }
}
