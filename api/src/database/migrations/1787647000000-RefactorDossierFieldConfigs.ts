import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorDossierFieldConfigs1787647000000 implements MigrationInterface {
  name = 'RefactorDossierFieldConfigs1787647000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 0. Ensure table exists if missing
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dossier_field_configs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "catalog_item_id" uuid,
        "dossier_type_code" character varying(64),
        "field_key" character varying(64) NOT NULL,
        "is_visible" boolean NOT NULL DEFAULT true,
        "is_required" boolean NOT NULL DEFAULT false,
        "is_default" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dossier_field_configs" PRIMARY KEY ("id"),
        CONSTRAINT "CK_dossier_field_configs_visible_required" CHECK (is_visible = true OR is_required = false)
      );
    `);

    // 1. Rename is_locked -> is_default
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dossier_field_configs' AND column_name = 'is_locked'
        ) THEN
          ALTER TABLE "dossier_field_configs" RENAME COLUMN "is_locked" TO "is_default";
        END IF;
      END $$;
    `);

    // 2. Drop section_key if exists
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dossier_field_configs' AND column_name = 'section_key'
        ) THEN
          ALTER TABLE "dossier_field_configs" DROP COLUMN "section_key";
        END IF;
      END $$;
    `);

    // 3. Drop sort_order if exists
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dossier_field_configs' AND column_name = 'sort_order'
        ) THEN
          ALTER TABLE "dossier_field_configs" DROP COLUMN "sort_order";
        END IF;
      END $$;
    `);

    // 4. Fix unique constraint to be on (dossier_type_code, field_key) instead of (catalog_item_id, field_key)
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_dossier_field_config_item_field";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_dossier_field_configs_lookup";`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_dossier_field_configs_type_field" 
      ON "dossier_field_configs" ("dossier_type_code", "field_key");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_dossier_field_configs_type_field";`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_dossier_field_config_item_field" 
      ON "dossier_field_configs" (COALESCE("catalog_item_id", '00000000-0000-0000-0000-000000000000'::uuid), "field_key");
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dossier_field_configs' AND column_name = 'sort_order'
        ) THEN
          ALTER TABLE "dossier_field_configs" ADD COLUMN "sort_order" integer NOT NULL DEFAULT 0;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dossier_field_configs' AND column_name = 'section_key'
        ) THEN
          ALTER TABLE "dossier_field_configs" ADD COLUMN "section_key" character varying(64) NOT NULL DEFAULT 'g1';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dossier_field_configs' AND column_name = 'is_default'
        ) THEN
          ALTER TABLE "dossier_field_configs" RENAME COLUMN "is_default" TO "is_locked";
        END IF;
      END $$;
    `);
  }
}
