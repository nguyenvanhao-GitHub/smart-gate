import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đổi cột `declarations.checkpoint` từ enum `declarations_checkpoint_enum` sang `varchar(32)`
 * để nhận các mã chốt/cổng mới như `A1`, `A2` (Cửa nhập cảnh) mà không bị lỗi PostgreSQL enum.
 */
export class DeclarationsCheckpointToVarchar1784076300000 implements MigrationInterface {
  name = 'DeclarationsCheckpointToVarchar1784076300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "declarations" ALTER COLUMN "checkpoint" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "declarations" ALTER COLUMN "checkpoint" TYPE character varying(32) USING "checkpoint"::text`,
    );
    await queryRunner.query(`ALTER TABLE "declarations" ALTER COLUMN "checkpoint" SET DEFAULT 'SMART_GATE'`);
    await queryRunner.query(`DROP TYPE IF EXISTS "declarations_checkpoint_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "declarations_checkpoint_enum" AS ENUM ('B1', 'B2', 'B5', 'YARD', 'SMART_GATE')`,
    );
    await queryRunner.query(`ALTER TABLE "declarations" ALTER COLUMN "checkpoint" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "declarations" ALTER COLUMN "checkpoint" TYPE "declarations_checkpoint_enum" USING "checkpoint"::"declarations_checkpoint_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "declarations" ALTER COLUMN "checkpoint" SET DEFAULT 'SMART_GATE'`);
  }
}
