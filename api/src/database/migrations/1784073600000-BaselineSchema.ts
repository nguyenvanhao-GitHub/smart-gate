import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ảnh chụp schema **trước P1** (`users`, `declarations`) — hai bảng này vốn do `synchronize` tạo ra
 * chứ chưa từng có migration nào.
 *
 * Toàn bộ lệnh dùng `IF NOT EXISTS` để migration chạy được trên cả hai tình huống:
 * - Database rỗng (môi trường mới, production lần đầu) → tạo đầy đủ.
 * - Database đã có dữ liệu do `synchronize` sinh ra (dev, testing) → không làm gì, chỉ ghi nhận
 *   là đã áp dụng để migration P1 phía sau chạy tiếp được.
 *
 * Vì vậy `down()` cũng phải thận trọng: chỉ xoá đúng hai bảng này (xem cảnh báo bên dưới).
 */
export class BaselineSchema1784073600000 implements MigrationInterface {
  name = 'BaselineSchema1784073600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "users_role_enum" AS ENUM (
          'ADMIN','OPS','DN','DRIVER','HQ_B1','HQ_B2','HQ_B5','HQ_MOBILE','BP_B1','BP_B2_IN',
          'BP_B2_OUT','BP_B5','BP_COMPLETE','KD_YT','KD_TV','KD_DV','TAX','BQL','INSURANCE'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "users_status_enum" AS ENUM ('ACTIVE','LOCKED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL,
        "username" character varying(64) NOT NULL,
        "passwordHash" character varying(128) NOT NULL,
        "displayName" character varying(160) NOT NULL,
        "title" character varying(160) NOT NULL,
        "role" "users_role_enum" NOT NULL,
        "defaultRoute" character varying(160) NOT NULL,
        "status" "users_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_username" ON "users" ("username")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_role" ON "users" ("role")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_status" ON "users" ("status")`);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "declarations_type_enum" AS ENUM ('EXPORT','IMPORT','SELF_PROPELLED','TRANSSHIPMENT');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "declarations_status_enum" AS ENUM (
          'DRAFT','SUBMITTED','PROCESSING','REVISION_REQUIRED','WAITING_FOR_FEE','PAID','COMPLETED','REJECTED','CANCELLED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "declarations_checkpoint_enum" AS ENUM ('B1','B2','B5','YARD','SMART_GATE');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "declarations" (
        "id" uuid NOT NULL,
        "code" character varying(32) NOT NULL,
        "type" "declarations_type_enum" NOT NULL,
        "status" "declarations_status_enum" NOT NULL,
        "feeDeclarationCode" character varying(32),
        "customsDeclarationNumber" character varying(64),
        "enterpriseTaxCode" character varying(32) NOT NULL,
        "enterprise" jsonb NOT NULL,
        "plateNumber" character varying(32) NOT NULL,
        "containerNumber" character varying(64),
        "trailerNumber" character varying(64),
        "vehicle" jsonb NOT NULL,
        "cargo" jsonb NOT NULL,
        "checkpoint" "declarations_checkpoint_enum" NOT NULL DEFAULT 'SMART_GATE',
        "forceProgress" jsonb NOT NULL,
        "workflowProgress" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "auditTrail" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_declarations" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_declarations_code" ON "declarations" ("code")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_declarations_type" ON "declarations" ("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_declarations_status" ON "declarations" ("status")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_declarations_fee_code" ON "declarations" ("feeDeclarationCode")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_declarations_customs_number" ON "declarations" ("customsDeclarationNumber")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_declarations_tax_code" ON "declarations" ("enterpriseTaxCode")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_declarations_plate" ON "declarations" ("plateNumber")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_declarations_container" ON "declarations" ("containerNumber")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_declarations_trailer" ON "declarations" ("trailerNumber")`);
  }

  /**
   * ⚠️ Xoá hai bảng nghiệp vụ gốc — chỉ dùng khi dựng lại môi trường từ đầu.
   * Không bao giờ chạy trên production đang vận hành.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "declarations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "declarations_checkpoint_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "declarations_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "declarations_type_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
  }
}
