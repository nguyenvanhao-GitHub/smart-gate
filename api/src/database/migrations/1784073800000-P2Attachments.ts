import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bảng `attachments` — viên gạch nền của P2 (F11: lưu trữ tệp đính kèm của hồ sơ).
 *
 * Ghi chú thiết kế:
 * - `dossier_id` **nullable** ở bước này: việc tách bảng hồ sơ (`Enterprise`/`Vehicle`/`CargoItem`…)
 *   làm ở lượt sau, và màn khai báo theo bước UI-04 cho phép tải chứng từ trước khi hồ sơ tồn tại.
 * - `storage_key` là khoá do **server** sinh (UUID) chứ không phải tên tệp của client — chống path
 *   traversal. Đặt UNIQUE để không có hai bản ghi cùng trỏ vào một đối tượng trên kho lưu trữ.
 * - `size_bytes` dùng `integer`: dung lượng bị chặn ở 15 MB nên không cần `bigint`.
 * - Không tạo khoá ngoại, đúng quy ước đã ghi trong migration P1: các ORM entity của dự án chỉ lưu
 *   id thuần, thêm FK ở đây mà entity không khai sẽ làm schema lệch khi ai đó bật `synchronize`.
 */
export class P2Attachments1784073800000 implements MigrationInterface {
  name = 'P2Attachments1784073800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attachments" (
        "id" uuid NOT NULL,
        "dossier_id" uuid,
        "original_name" character varying(255) NOT NULL,
        "mime_type" character varying(128) NOT NULL,
        "size_bytes" integer NOT NULL,
        "storage_key" character varying(255) NOT NULL,
        "checksum" character varying(128) NOT NULL,
        "document_type_code" character varying(64),
        "uploaded_by_id" uuid NOT NULL,
        "uploaded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by_id" uuid,
        CONSTRAINT "PK_attachments" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_attachments_storage_key" ON "attachments" ("storage_key")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_attachments_dossier" ON "attachments" ("dossier_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_attachments_checksum" ON "attachments" ("checksum")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_attachments_uploaded_by" ON "attachments" ("uploaded_by_id")`,
    );
    // Truy vấn nóng nhất: danh sách chứng từ còn hiệu lực của một hồ sơ (tab "Chứng từ" UI-05).
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_attachments_dossier_status" ON "attachments" ("dossier_id", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attachments_dossier_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attachments_uploaded_by"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attachments_checksum"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attachments_dossier"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_attachments_storage_key"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attachments"`);
  }
}
