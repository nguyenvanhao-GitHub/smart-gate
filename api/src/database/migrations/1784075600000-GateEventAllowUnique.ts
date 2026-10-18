import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BUG-003 — chống **ghi lặp lượt cho qua cổng** ở tầng database (F38).
 *
 * Thêm **một chỉ mục duy nhất có điều kiện** trên `gate_events`:
 *
 * | Chỉ mục | Bảo đảm |
 * |---|---|
 * | `uq_gate_events_allow_direction` (dossier_id, direction) WHERE decision = 'ALLOW' | Mỗi hồ sơ chỉ **một lượt CHO QUA** theo mỗi chiều (VÀO/RA) |
 *
 * Là **chỉ mục có điều kiện**: chỉ ràng buộc các lượt `ALLOW`, nên các lượt bị TỪ CHỐI (`DENY`)
 * vẫn ghi được bao nhiêu lần tùy ý — đó là dấu vết mỗi lần chặn xe. Đặt ở tầng database theo tiền
 * lệ "1 xe không 2 vị trí" (F29): hai yêu cầu chạy song song đều đọc thấy "chưa có ai" trước khi
 * ghi, chỉ ràng buộc dữ liệu mới chặn được. Use-case bắt lỗi `23505` đổi thành 409.
 *
 * Bảng `gate_events` là **chỉ thêm** nên đây là migration **append-only**: không đụng bảng/cột nào,
 * chỉ thêm đúng một chỉ mục.
 *
 * ⚠️ **Dữ liệu đang có phải sạch trước khi chạy**: nếu đã tồn tại hai lượt `ALLOW` cùng chiều cho
 * một hồ sơ (do lỗi trước khi vá) thì `CREATE UNIQUE INDEX` không tạo được. Migration kiểm trước và
 * dừng có thông báo liệt kê hồ sơ vi phạm — dọn dữ liệu là quyết định nghiệp vụ, migration không tự sửa.
 *
 * `down()` đảo ngược thật: xoá đúng chỉ mục này.
 */
export class GateEventAllowUnique1784075600000 implements MigrationInterface {
  name = 'GateEventAllowUnique1784075600000';

  private readonly logger = new Logger('GateEventAllowUnique');

  private readonly indexName = 'uq_gate_events_allow_direction';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates: Array<{ dossier_id: string; direction: string; count: number }> = await queryRunner.query(
      `SELECT "dossier_id", "direction", COUNT(*)::int AS count
       FROM "gate_events"
       WHERE "decision" = 'ALLOW'
       GROUP BY "dossier_id", "direction"
       HAVING COUNT(*) > 1`,
    );
    if (duplicates.length > 0) {
      throw new Error(
        `Migration GateEventAllowUnique dừng: đang có ${duplicates.length} cặp (hồ sơ × chiều) bị ghi ` +
          `CHO QUA trùng [${duplicates.map((row) => `${row.dossier_id}/${row.direction} × ${row.count}`).join(', ')}]. ` +
          'Hãy dọn các sự kiện cổng trùng rồi chạy lại — migration không tự sửa dữ liệu nghiệp vụ.',
      );
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${this.indexName}"
       ON "gate_events" ("dossier_id", "direction") WHERE "decision" = 'ALLOW'`,
    );

    await this.verify(queryRunner);
  }

  /** Thiếu chỉ mục là ném lỗi để TypeORM hoàn tác cả giao dịch. */
  private async verify(queryRunner: QueryRunner): Promise<void> {
    const found: Array<{ indexname: string }> = await queryRunner.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      [this.indexName],
    );
    this.logger.log(`Đối chiếu GateEventAllowUnique: chỉ mục ${found.length}/1.`);
    if (found.length < 1) {
      throw new Error(`Migration GateEventAllowUnique chưa tạo được chỉ mục "${this.indexName}". Đã hoàn tác toàn bộ.`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "${this.indexName}"`);
  }
}
