import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Xoá các nhóm danh mục và mục danh mục rác/thử nghiệm không sử dụng (SG-252):
 * 1. Mục 'VN01' ('hj') trong danh mục Loại phương tiện (VEHICLE_TYPE)
 * 2. Nhóm danh mục thử nghiệm 'test danh mục nè hi hi' cùng các mục con của nó
 * 3. Bất kỳ nhóm danh mục thử nghiệm nào có tên/mã chứa 'test danh mục' / 'test'
 */
export class DeleteUnusedTestCatalogs1787739000000 implements MigrationInterface {
  name = 'DeleteUnusedTestCatalogs1787739000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Xoá mục rác VN01 trong VEHICLE_TYPE
    await queryRunner.query(
      `DELETE FROM "catalog_items" WHERE "type_code" = 'VEHICLE_TYPE' AND ("code" = 'VN01' OR "name" = 'hj')`,
    );

    // 2. Xoá các mục con thuộc nhóm danh mục thử nghiệm
    await queryRunner.query(
      `DELETE FROM "catalog_items" WHERE "type_code" IN (
        SELECT "code" FROM "catalog_types"
        WHERE "code" ILIKE '%test%'
           OR "name" ILIKE '%test danh mục%'
           OR "description" ILIKE '%test danh mục%'
      )`,
    );

    // 3. Xoá các nhóm danh mục thử nghiệm
    await queryRunner.query(
      `DELETE FROM "catalog_types"
       WHERE "code" ILIKE '%test%'
          OR "name" ILIKE '%test danh mục%'
          OR "description" ILIKE '%test danh mục%'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Dữ liệu rác/thử nghiệm không cần khôi phục lại khi rollback
  }
}