import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { PLATE_BLOCKING_STATUSES } from '../../modules/declarations/domain/plate-uniqueness.rules';

/**
 * P12 (CR8/CR9/CR18/CR33) — **một phương tiện vận chuyển / hồ sơ**, **cho trùng biển giữa các hồ sơ**,
 * và thêm bảng **phương tiện sang tải**.
 *
 * Ba việc, tất cả append-only:
 *
 * 1. **Cho trùng biển số giữa các hồ sơ (bỏ F09)**: `DROP INDEX uq_vehicles_active_plate` (chỉ mục
 *    duy nhất có điều kiện tạo ở P9). Một xe nay được phép đi nhiều lượt/nhiều hồ sơ đang hoạt động.
 *    **Không** dựng lại `uq_declarations_active_plate` cũ. Cột `dossier_active` giữ nguyên (không hại).
 *
 * 2. **Về một xe/hồ sơ**: khóa max-1 nằm ở tầng ứng dụng (`Declaration.setVehicles`). Migration
 *    **KHÔNG tự sửa dữ liệu**: chỉ **kiểm trước** — nếu còn hồ sơ đang giữ >1 phương tiện thì **dừng
 *    và liệt kê** (khuôn cảnh báo P9), để nghiệp vụ dedup (giữ `line_no = 1`). Không dựng ràng buộc
 *    duy nhất cứng trên `dossier_id` (giữ được dữ liệu lịch sử nhiều xe để đọc; xem #S2).
 *
 * 3. **Bảng mới `transshipment_vehicles`** (khuôn `cargo_items`): mỗi hồ sơ Sang tải (TRANSSHIPMENT)
 *    có thể khai nhiều phương tiện nhận sang tải; lái xe ở đây theo mockup chỉ là **tên** (#S1).
 *
 * `down()` đảo ngược thật: dựng lại chỉ mục `uq_vehicles_active_plate` và DROP bảng sang tải.
 * `migration:check` chạy tiến/lùi/tiến sạch (DB tạm trống nên bước kiểm >1 xe luôn qua).
 */
export class P12OneVehicleAndTransshipment1784076400000 implements MigrationInterface {
  name = 'P12OneVehicleAndTransshipment1784076400000';

  private readonly logger = new Logger('P12OneVehicleAndTransshipment');

  /** Điều kiện "hồ sơ đang giữ chỗ biển số" dựng từ đúng danh sách trong `plate-uniqueness.rules`. */
  private plateActiveCondition(): string {
    const statuses = PLATE_BLOCKING_STATUSES.map((status) => `'${status}'`).join(', ');
    return `"status" IN (${statuses})`;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertSingleVehicle(queryRunner);
    await this.dropPlateUniqueness(queryRunner);
    await this.createTransshipmentTable(queryRunner);
  }

  // ---------------------------------------------------------------- Kiểm 1 xe/hồ sơ

  /**
   * Dừng migration nếu còn hồ sơ **đang hoạt động** giữ nhiều hơn một phương tiện. Không tự xóa —
   * dedup là quyết định nghiệp vụ (giữ `line_no = 1`). Hồ sơ đã kết thúc/nháp không tính (không còn
   * đi qua cửa khẩu).
   */
  private async assertSingleVehicle(queryRunner: QueryRunner): Promise<void> {
    const offenders: Array<{ dossier_id: string; count: number }> = await queryRunner.query(
      `SELECT v."dossier_id", COUNT(*)::int AS count
       FROM "vehicles" v
       JOIN "declarations" d ON d."id" = v."dossier_id"
       WHERE d.${this.plateActiveCondition()}
       GROUP BY v."dossier_id"
       HAVING COUNT(*) > 1`,
    );
    if (offenders.length > 0) {
      throw new Error(
        `Migration P12 dừng: đang có ${offenders.length} hồ sơ giữ nhiều hơn một phương tiện ` +
          `[${offenders.map((row) => `${row.dossier_id} × ${row.count}`).join(', ')}]. ` +
          'Hãy dedup về một xe (giữ line_no = 1) rồi chạy lại — migration không tự sửa dữ liệu nghiệp vụ.',
      );
    }
  }

  // ---------------------------------------------------------------- Bỏ F09

  private async dropPlateUniqueness(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_vehicles_active_plate"`);
  }

  // ---------------------------------------------------------------- Bảng sang tải

  private async createTransshipmentTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transshipment_vehicles" (
        "id" uuid NOT NULL,
        "dossier_id" uuid NOT NULL,
        "line_no" integer NOT NULL,
        "source_plate" character varying(32),
        "plate_number" character varying(32) NOT NULL,
        "vehicle_type" character varying(32),
        "container_number" character varying(64),
        "trailer_number" character varying(64),
        "driver_name" character varying(160),
        "fee01" character varying(32),
        "transfer_place" character varying(200),
        "note" character varying(500),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transshipment_vehicles" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transshipment_vehicles_dossier" ON "transshipment_vehicles" ("dossier_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transshipment_vehicles_dossier_line"
       ON "transshipment_vehicles" ("dossier_id", "line_no")`,
    );
  }

  // ---------------------------------------------------------------- Hoàn tác

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transshipment_vehicles_dossier_line"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transshipment_vehicles_dossier"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transshipment_vehicles"`);

    // Khôi phục chỉ mục F09 cũ trên bảng vehicles (chỉ chạy được khi dữ liệu chưa có biển trùng).
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_vehicles_active_plate"
       ON "vehicles" (LOWER("plate_number")) WHERE "dossier_active"`,
    );
    this.logger.log('Đã hoàn tác P12: dựng lại uq_vehicles_active_plate và bỏ bảng transshipment_vehicles.');
  }
}
