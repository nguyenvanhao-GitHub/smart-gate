import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { PLATE_BLOCKING_STATUSES } from '../../modules/declarations/domain/plate-uniqueness.rules';

/**
 * P9 — một hồ sơ có **nhiều phương tiện** và chống trùng biển số theo **từng xe** (F09).
 *
 * Trước đây `vehicles.dossier_id` là **duy nhất** (mỗi hồ sơ đúng một xe) và F09 chặn ở chỉ mục
 * `uq_declarations_active_plate` trên cột denormalized `declarations."plateNumber"`. Nay:
 *
 * 1. Bỏ ràng buộc duy nhất `UQ_vehicles_dossier`, đổi thành index thường trên `dossier_id`; thêm
 *    cột `line_no` (thứ tự xe) và `dossier_active` (hồ sơ có đang giữ chỗ biển số hay không —
 *    denormalized theo trạng thái hồ sơ để chỉ mục biển số chỉ soi hồ sơ đang hoạt động).
 * 2. Bỏ chỉ mục F09 cũ trên `declarations`, thay bằng **chỉ mục duy nhất có điều kiện**
 *    `uq_vehicles_active_plate` trên `vehicles (LOWER(plate_number)) WHERE dossier_active` — một
 *    biển số chỉ nằm trong một hồ sơ đang hoạt động, tính không phân biệt hoa thường và theo mọi xe.
 *
 * Việc chặn nằm ở **tầng database** chứ không ở câu kiểm trước khi ghi (bài học F27/F29): hai yêu cầu
 * chạy song song đều đọc thấy "chưa có ai" trước khi ghi. Use-case bắt lỗi `23505` đổi thành 409.
 *
 * ⚠️ **Dữ liệu đang có phải sạch trước khi chạy**: nếu đã tồn tại hai xe cùng biển (không phân biệt
 * hoa thường) thuộc hai hồ sơ đang hoạt động thì `CREATE UNIQUE INDEX` không tạo được. Migration
 * kiểm trước và dừng có thông báo liệt kê đúng biển vi phạm — xử lý dữ liệu là quyết định nghiệp vụ.
 *
 * `down()` đảo ngược thật: khôi phục `uq_declarations_active_plate` và ràng buộc duy nhất
 * `UQ_vehicles_dossier`, gỡ chỉ mục/cột đã thêm.
 */
export class P9VehiclesMultiPerDossier1784075400000 implements MigrationInterface {
  name = 'P9VehiclesMultiPerDossier1784075400000';

  private readonly logger = new Logger('P9VehiclesMultiPerDossier');

  /** Điều kiện "hồ sơ đang giữ chỗ biển số" dựng từ đúng danh sách trong `plate-uniqueness.rules`. */
  private declarationBlockingCondition(alias = ''): string {
    const prefix = alias ? `${alias}.` : '';
    const statuses = PLATE_BLOCKING_STATUSES.map((status) => `'${status}'`).join(', ');
    return `${prefix}"status" IN (${statuses})`;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumns(queryRunner);
    await this.reshapeDossierIndex(queryRunner);
    await this.movePlateUniqueness(queryRunner);
    await this.verify(queryRunner);
  }

  // ---------------------------------------------------------------- Cột mới + backfill

  private async addColumns(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "line_no" integer NOT NULL DEFAULT 1`);
    await queryRunner.query(
      `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "dossier_active" boolean NOT NULL DEFAULT false`,
    );
    // Backfill "đang giữ chỗ" từ trạng thái hồ sơ hiện tại; hồ sơ đã kết thúc/nháp giữ false.
    await queryRunner.query(
      `UPDATE "vehicles" AS v SET "dossier_active" = true
       FROM "declarations" AS d
       WHERE v."dossier_id" = d."id" AND ${this.declarationBlockingCondition('d')}`,
    );
  }

  // ---------------------------------------------------------------- Bỏ duy nhất dossier_id

  private async reshapeDossierIndex(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_vehicles_dossier"`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_vehicles_dossier" ON "vehicles" ("dossier_id")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_vehicles_dossier_line" ON "vehicles" ("dossier_id", "line_no")`,
    );
  }

  // ---------------------------------------------------------------- F09 chuyển sang bảng vehicles

  private async movePlateUniqueness(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_declarations_active_plate"`);

    const duplicates: Array<{ plate: string; count: number }> = await queryRunner.query(
      `SELECT LOWER("plate_number") AS plate, COUNT(*)::int AS count
       FROM "vehicles"
       WHERE "dossier_active" AND "plate_number" IS NOT NULL AND "plate_number" <> ''
       GROUP BY LOWER("plate_number")
       HAVING COUNT(*) > 1`,
    );
    if (duplicates.length > 0) {
      throw new Error(
        `Migration P9 dừng: đang có ${duplicates.length} biển số nằm trong nhiều hồ sơ chưa kết thúc ` +
          `[${duplicates.map((row) => `${row.plate} × ${row.count}`).join(', ')}]. ` +
          'Hãy hủy/kết thúc các hồ sơ trùng rồi chạy lại — migration không tự sửa dữ liệu nghiệp vụ.',
      );
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_vehicles_active_plate"
       ON "vehicles" (LOWER("plate_number")) WHERE "dossier_active"`,
    );
  }

  // ---------------------------------------------------------------- Đối chiếu

  private async verify(queryRunner: QueryRunner): Promise<void> {
    const found: Array<{ indexname: string }> = await queryRunner.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)`,
      [['uq_vehicles_active_plate', 'IDX_vehicles_dossier', 'IDX_vehicles_dossier_line']],
    );
    const columns: Array<{ column_name: string }> = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'vehicles' AND column_name = ANY($1)`,
      [['line_no', 'dossier_active']],
    );
    this.logger.log(`Đối chiếu P9: chỉ mục ${found.length}/3 · cột mới ${columns.length}/2.`);
    if (found.length < 3 || columns.length < 2) {
      throw new Error('Migration P9 chưa tạo đủ chỉ mục/cột. Đã hoàn tác toàn bộ.');
    }
  }

  // ---------------------------------------------------------------- Hoàn tác

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_vehicles_active_plate"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_vehicles_dossier_line"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_vehicles_dossier"`);

    // Khôi phục ràng buộc duy nhất "một hồ sơ một xe" (chỉ chạy được khi dữ liệu chưa có hồ sơ đa xe).
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_vehicles_dossier" ON "vehicles" ("dossier_id")`);

    // Khôi phục chỉ mục F09 cũ trên cột denormalized của bảng declarations.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_declarations_active_plate"
       ON "declarations" ("plateNumber")
       WHERE ${this.declarationBlockingCondition()} AND "plateNumber" IS NOT NULL AND "plateNumber" <> ''`,
    );

    await queryRunner.query(`ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "dossier_active"`);
    await queryRunner.query(`ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "line_no"`);
  }
}
