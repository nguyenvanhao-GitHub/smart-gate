import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cập nhật dữ liệu từ loại hình hồ sơ cũ `TRANSSHIPMENT` sang `TRANSSHIPMENT_IMPORT` (Sang tải đầu nhập),
 * đổi cột `declarations.type` sang `varchar(32)` để tránh giới hạn transaction với PostgreSQL enum,
 * và nạp mã `TRANSSHIPMENT_EXPORT` (Sang tải đầu xuất) vào danh mục.
 * STT (sort_order): EXPORT (1), IMPORT (2), TRANSSHIPMENT_EXPORT (3), SELF_PROPELLED (4), TRANSSHIPMENT_IMPORT (5).
 */
export class MigrateTransshipmentToTransshipmentImport1784077600000 implements MigrationInterface {
  name = 'MigrateTransshipmentToTransshipmentImport1784077600000';

  private readonly logger = new Logger('MigrateTransshipmentToTransshipmentImport');

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Chuyển cột declarations.type từ PostgreSQL enum sang varchar(32) nếu còn là enum
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'declarations' AND column_name = 'type' AND data_type = 'USER-DEFINED'
        ) THEN
          ALTER TABLE "declarations" ALTER COLUMN "type" TYPE character varying(32) USING "type"::text;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "declarations_type_enum";
    `);

    // 2. Chuyển hồ sơ khai báo từ TRANSSHIPMENT sang TRANSSHIPMENT_IMPORT
    await queryRunner.query(`
      UPDATE "declarations"
      SET "type" = 'TRANSSHIPMENT_IMPORT'
      WHERE "type" = 'TRANSSHIPMENT';
    `);

    // 3. Chuyển phiên xử lý workflow từ TRANSSHIPMENT sang TRANSSHIPMENT_IMPORT
    await queryRunner.query(`
      UPDATE "workflow_instances"
      SET "dossier_type" = 'TRANSSHIPMENT_IMPORT'
      WHERE "dossier_type" = 'TRANSSHIPMENT';
    `);

    // 4. Xử lý an toàn mục danh mục DOSSIER_TYPE và cập nhật STT = 5 cho TRANSSHIPMENT_IMPORT
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM catalog_items WHERE type_code = 'DOSSIER_TYPE' AND code = 'TRANSSHIPMENT_IMPORT') THEN
          DELETE FROM catalog_items WHERE type_code = 'DOSSIER_TYPE' AND code = 'TRANSSHIPMENT';
          UPDATE catalog_items SET sort_order = 5 WHERE type_code = 'DOSSIER_TYPE' AND code = 'TRANSSHIPMENT_IMPORT';
        ELSE
          UPDATE catalog_items 
          SET code = 'TRANSSHIPMENT_IMPORT', name = 'Sang tải đầu nhập', sort_order = 5 
          WHERE type_code = 'DOSSIER_TYPE' AND code = 'TRANSSHIPMENT';
        END IF;
      END $$;
    `);

    // Cập nhật STT = 4 cho SELF_PROPELLED nếu có
    await queryRunner.query(`
      UPDATE catalog_items SET sort_order = 4 WHERE type_code = 'DOSSIER_TYPE' AND code = 'SELF_PROPELLED';
    `);

    // 5. Thêm mã mục TRANSSHIPMENT_EXPORT (Sang tải đầu xuất, STT = 3) vào DOSSIER_TYPE nếu chưa có
    await queryRunner.query(`
      INSERT INTO "catalog_items" ("id", "type_code", "code", "name", "sort_order", "status", "metadata")
      VALUES (
        gen_random_uuid(),
        'DOSSIER_TYPE',
        'TRANSSHIPMENT_EXPORT',
        'Sang tải đầu xuất',
        3,
        'ACTIVE',
        '{"declarationType": "TRANSSHIPMENT_EXPORT"}'::jsonb
      )
      ON CONFLICT ("type_code", "code") DO UPDATE SET sort_order = 3;
    `);

    // 6. Cập nhật fee_rules (cột applies_to dạng JSONB array)
    await queryRunner.query(`
      UPDATE "fee_rules"
      SET "applies_to" = (
        SELECT jsonb_agg(
          CASE 
            WHEN elem = '"TRANSSHIPMENT"'::jsonb THEN '"TRANSSHIPMENT_IMPORT"'::jsonb 
            ELSE elem 
          END
        )
        FROM jsonb_array_elements("applies_to") AS elem
      )
      WHERE "applies_to" @> '["TRANSSHIPMENT"]'::jsonb;
    `);

    // 7. Cập nhật metadata trong catalog_items (REQUIRED_DOCUMENT)
    await queryRunner.query(`
      UPDATE "catalog_items"
      SET "metadata" = jsonb_set(
        "metadata",
        '{dossierTypes}',
        (
          SELECT jsonb_agg(
            CASE 
              WHEN elem = '"TRANSSHIPMENT"'::jsonb THEN '"TRANSSHIPMENT_IMPORT"'::jsonb 
              ELSE elem 
            END
          )
          FROM jsonb_array_elements("metadata"->'dossierTypes') AS elem
        )
      )
      WHERE "type_code" = 'REQUIRED_DOCUMENT' 
        AND "metadata"->'dossierTypes' @> '["TRANSSHIPMENT"]'::jsonb;
    `);

    this.logger.log('Đã chuyển đổi thành công tất cả dữ liệu cũ TRANSSHIPMENT sang TRANSSHIPMENT_IMPORT và bổ sung TRANSSHIPMENT_EXPORT.');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "declarations"
      SET "type" = 'TRANSSHIPMENT'
      WHERE "type" = 'TRANSSHIPMENT_IMPORT';
    `);

    await queryRunner.query(`
      UPDATE "workflow_instances"
      SET "dossier_type" = 'TRANSSHIPMENT'
      WHERE "dossier_type" = 'TRANSSHIPMENT_IMPORT';
    `);
  }
}
