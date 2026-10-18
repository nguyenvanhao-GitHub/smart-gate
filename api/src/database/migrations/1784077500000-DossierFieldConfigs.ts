import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration tạo bảng `dossier_field_configs`:
 * Lưu trữ cấu hình bật/tắt cờ hiển thị (is_visible) và bắt buộc (is_required) cho các trường có sẵn trong hệ thống.
 * Áp dụng mặc định chung (catalog_item_id IS NULL) hoặc áp dụng riêng cho từng loại hồ sơ (EXPORT, IMPORT, TRANSSHIPMENT,...).
 */
export class DossierFieldConfigs1784077500000 implements MigrationInterface {
  name = 'DossierFieldConfigs1784077500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dossier_field_configs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "catalog_item_id" uuid,
        "dossier_type_code" character varying(64),
        "section_key" character varying(64) NOT NULL,
        "field_key" character varying(64) NOT NULL,
        "is_visible" boolean NOT NULL DEFAULT true,
        "is_required" boolean NOT NULL DEFAULT false,
        "is_locked" boolean NOT NULL DEFAULT false,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dossier_field_configs" PRIMARY KEY ("id"),
        CONSTRAINT "CK_dossier_field_configs_visible_required" CHECK (is_visible = true OR is_required = false)
      );
    `);

    // Index tối ưu hóa việc tra cứu trường theo loại hồ sơ & theo nhóm
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dossier_field_configs_lookup" 
      ON "dossier_field_configs" ("catalog_item_id", "section_key");
    `);

    // Unique Index ngăn ngừa trùng lặp field_key cho cùng một loại hồ sơ (bao gồm cả cấu hình mặc định NULL)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_dossier_field_config_item_field" 
      ON "dossier_field_configs" (COALESCE("catalog_item_id", '00000000-0000-0000-0000-000000000000'::uuid), "field_key");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_dossier_field_config_item_field"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_dossier_field_configs_lookup"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dossier_field_configs"`);
  }
}
