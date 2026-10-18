import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Xoá các nhóm danh mục thừa không sử dụng khỏi CSDL:
 * 1. Khung giờ tiếp nhận (TIME_SLOT) - Bỏ theo CR11 (F28).
 * 2. Cổng cửa khẩu (BORDER_GATE) - Không còn sử dụng nghiệp vụ cổng.
 * 3. Làn qua cổng (GATE_LANE) - Không còn sử dụng làn xe.
 * 4. Checklist điều kiện qua cổng (GATE_CHECKLIST) - Không còn sử dụng checklist qua cổng.
 *
 * Migration timestamp: 1787900000000 (đảm bảo lớn hơn mọi migration hiện có như 1787819000000
 * để TypeORM migration runner chắc chắn thực thi trên môi trường Testing / Production).
 */
export class DeleteRedundantCatalogs1787900000000 implements MigrationInterface {
  name = 'DeleteRedundantCatalogs1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const typeCodes = ['TIME_SLOT', 'BORDER_GATE', 'GATE_LANE', 'GATE_CHECKLIST'];
    const typeList = typeCodes.map((code) => `'${code}'`).join(', ');

    // 1. Xoá các mục con thuộc các nhóm danh mục thừa
    await queryRunner.query(`DELETE FROM "catalog_items" WHERE "type_code" IN (${typeList})`);

    // 2. Xoá các nhóm danh mục thừa
    await queryRunner.query(`DELETE FROM "catalog_types" WHERE "code" IN (${typeList})`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Các danh mục thừa không cần khôi phục lại khi rollback
  }
}
