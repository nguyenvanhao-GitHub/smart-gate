import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sửa metadata.checkpoint trong catalog_items cho loại BORDER_GATE:
 * - A1 (Cửa A1 - Nhập cảnh): checkpoint = 'A1' (trước đó bị nhầm thành 'B1')
 * - A2 (Cửa A2 - Nhập cảnh): checkpoint = 'A2' (trước đó bị nhầm thành 'B1')
 * - B1 (Cửa B1 - Xuất cảnh): checkpoint = 'B1' (trước đó bị nhầm thành 'B2')
 * - B2 (Cửa B2 - Xuất cảnh): checkpoint = 'B2' (đã đúng)
 */
export class FixBorderGateMetadataCheckpoint1784076200000 implements MigrationInterface {
  name = 'FixBorderGateMetadataCheckpoint1784076200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "catalog_items"
      SET "metadata" = jsonb_set("metadata", '{checkpoint}', '"A1"')
      WHERE "type_code" = 'BORDER_GATE' AND "code" = 'A1';
    `);

    await queryRunner.query(`
      UPDATE "catalog_items"
      SET "metadata" = jsonb_set("metadata", '{checkpoint}', '"A2"')
      WHERE "type_code" = 'BORDER_GATE' AND "code" = 'A2';
    `);

    await queryRunner.query(`
      UPDATE "catalog_items"
      SET "metadata" = jsonb_set("metadata", '{checkpoint}', '"B1"')
      WHERE "type_code" = 'BORDER_GATE' AND "code" = 'B1';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "catalog_items"
      SET "metadata" = jsonb_set("metadata", '{checkpoint}', '"B1"')
      WHERE "type_code" = 'BORDER_GATE' AND "code" = 'A1';
    `);

    await queryRunner.query(`
      UPDATE "catalog_items"
      SET "metadata" = jsonb_set("metadata", '{checkpoint}', '"B1"')
      WHERE "type_code" = 'BORDER_GATE' AND "code" = 'A2';
    `);

    await queryRunner.query(`
      UPDATE "catalog_items"
      SET "metadata" = jsonb_set("metadata", '{checkpoint}', '"B2"')
      WHERE "type_code" = 'BORDER_GATE' AND "code" = 'B1';
    `);
  }
}
