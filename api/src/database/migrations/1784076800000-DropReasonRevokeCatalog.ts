import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gỡ hẳn nhóm mã nguyên nhân **thu hồi xác nhận** (`REASON_REVOKE`). Quyết định REVOKE đã bị bỏ khỏi
 * luồng xử lý liên ngành (xem `workflow.enums.ts`) nên loại danh mục này cùng các mục con TH01/TH02/TH03
 * không còn ai đọc/ghi. `ReasonScope.REVOKE` và mục seed tương ứng cũng đã bị xóa khỏi mã nguồn.
 *
 * `up()` xóa mọi mục con rồi xóa loại danh mục. `down()` **tạo lại loại + bộ mã tạm** để
 * `migration:check` chạy tiến/lùi/tiến sạch — đây là dữ liệu danh mục đề xuất, không phải nghiệp vụ
 * thật nên khôi phục nguyên trạng là hợp lệ.
 */
export class DropReasonRevokeCatalog1784076800000 implements MigrationInterface {
  name = 'DropReasonRevokeCatalog1784076800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "catalog_items" WHERE "type_code" = 'REASON_REVOKE'`);
    await queryRunner.query(`DELETE FROM "catalog_types" WHERE "code" = 'REASON_REVOKE'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "catalog_types" ("id", "code", "name", "description", "is_system", "sort_order")
       VALUES ($1, 'REASON_REVOKE', 'Mã nguyên nhân - thu hồi xác nhận',
               'Bắt buộc chọn khi thu hồi xác nhận đã ghi nhận (F25). BỘ MÃ TẠM — SRS chưa ban hành danh mục chính thức (điểm D9).',
               true, 9)
       ON CONFLICT ("code") DO NOTHING`,
      [randomUUID()],
    );

    const items: Array<[string, string, number]> = [
      ['TH01', 'Xác nhận nhầm hồ sơ', 1],
      ['TH02', 'Phát hiện sai lệch sau khi xác nhận', 2],
      ['TH03', 'Theo yêu cầu của cơ quan chuyên ngành', 3],
    ];
    for (const [code, name, sortOrder] of items) {
      await queryRunner.query(
        `INSERT INTO "catalog_items" ("id", "type_code", "code", "name", "sort_order", "status")
         VALUES ($1, 'REASON_REVOKE', $2, $3, $4, 'ACTIVE')
         ON CONFLICT ("type_code", "code") DO NOTHING`,
        [randomUUID(), code, name, sortOrder],
      );
    }
  }
}
