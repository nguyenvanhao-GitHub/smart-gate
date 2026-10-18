import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nới `catalog_types.description` từ `varchar(255)` sang `text`.
 *
 * Vì sao cần: mô tả của danh mục là chỗ ghi lại **xuất xứ và tình trạng** của dữ liệu seed —
 * ví dụ "BỘ MÃ TẠM — SRS chưa ban hành danh mục chính thức (điểm D9)" hay phần giải thích
 * `metadata` của `REQUIRED_DOCUMENT`/`WORKFLOW_CHECKLIST`. Những câu này hiển thị trên màn hình
 * danh mục cho quản trị đọc, và chúng dài hơn 255 ký tự.
 *
 * Triệu chứng nếu không có migration này: `CatalogSeedService` chạy ở `onApplicationBootstrap`
 * ném `value too long for type character varying(255)` và **ứng dụng không khởi động được** —
 * build và unit test vẫn xanh vì không có test nào chạm PostgreSQL thật.
 * Bắt được nhờ `npm run migration:check` + khởi động thật.
 *
 * `text` và `varchar` trong PostgreSQL có cùng cách lưu trữ và hiệu năng, nên nới rộng không
 * tốn thêm gì; giới hạn 255 ở đây vốn là con số tùy tiện.
 */
export class CatalogDescriptionToText1784074100000 implements MigrationInterface {
  name = 'CatalogDescriptionToText1784074100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "catalog_types" ALTER COLUMN "description" TYPE text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Cắt bớt phần vượt quá trước khi thu hẹp, nếu không PostgreSQL từ chối đổi kiểu.
    await queryRunner.query(
      `UPDATE "catalog_types" SET "description" = LEFT("description", 255) WHERE LENGTH("description") > 255`,
    );
    await queryRunner.query(
      `ALTER TABLE "catalog_types" ALTER COLUMN "description" TYPE character varying(255)`,
    );
  }
}
