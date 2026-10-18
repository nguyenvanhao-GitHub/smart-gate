import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gỡ ba cột `jsonb` cũ của hồ sơ: `declarations.enterprise`, `declarations.vehicle`,
 * `declarations.cargo`. Chúng đã bị các bảng quan hệ `enterprises` / `vehicles` / `cargo_items`
 * (migration P2 `1784073900000`) thay thế và đường đọc/ghi đã chuyển hẳn sang bảng quan hệ.
 * Kết thúc giai đoạn ghi-kép — **rủi ro R2 đã được chủ dự án chấp nhận gỡ**.
 *
 * ⚠️ **GIỮ NGUYÊN** các cột `jsonb` workflow/nhật ký (`forceProgress`, `workflowProgress`,
 * `auditTrail`) và mọi cột scalar denormalized (`enterpriseTaxCode`, `enterprise_id`,
 * `plateNumber`, `containerNumber`, `trailerNumber`) — đó là trạng thái sống / cột index, không có
 * bảng quan hệ thay thế.
 *
 * `down()` chỉ **tạo lại cột rỗng** để `migration:check` chạy tiến/lùi/tiến sạch — **KHÔNG khôi
 * phục dữ liệu jsonb cũ** (dữ liệu đó đã có ở bảng quan hệ). Cột dựng lại để `nullable` nên an toàn
 * trên bảng đã có dữ liệu; nguyên bản là `NOT NULL` nhưng việc lùi ở đây là gỡ có chủ đích.
 */
export class DropDossierJsonbColumns1784075200000 implements MigrationInterface {
  name = 'DropDossierJsonbColumns1784075200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "declarations" DROP COLUMN IF EXISTS "enterprise"`);
    await queryRunner.query(`ALTER TABLE "declarations" DROP COLUMN IF EXISTS "vehicle"`);
    await queryRunner.query(`ALTER TABLE "declarations" DROP COLUMN IF EXISTS "cargo"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "declarations" ADD COLUMN IF NOT EXISTS "enterprise" jsonb`);
    await queryRunner.query(`ALTER TABLE "declarations" ADD COLUMN IF NOT EXISTS "vehicle" jsonb`);
    await queryRunner.query(`ALTER TABLE "declarations" ADD COLUMN IF NOT EXISTS "cargo" jsonb`);
  }
}
