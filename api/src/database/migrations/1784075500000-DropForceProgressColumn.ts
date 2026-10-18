import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gỡ cột `jsonb` cũ `declarations.forceProgress` (LÔ 5). Cột này là bản chụp tiến độ lực lượng **đóng
 * băng lúc gửi hồ sơ**, đã được thay hoàn toàn bằng phiên xử lý liên ngành trong bảng
 * `workflow_instances` / `workflow_instance_steps` (P3): đường quyết định cổng (LÔ 2) và đường phí
 * (LÔ 4) đều không còn đọc/ghi cột này, mapper/domain/dashboard cũng đã ngừng tham chiếu.
 *
 * An toàn để gỡ: backfill P3 (`workflow-progress-backfill`) đã dựng phiên cho **mọi hồ sơ đang hoạt
 * động** (không phải nháp/đã hủy) từ cột `workflowProgress`, nên không còn nghiệp vụ nào phụ thuộc dữ
 * liệu trong `forceProgress`.
 *
 * ⚠️ **GIỮ NGUYÊN** `workflowProgress` và `auditTrail` — đó là trạng thái sống / nhật ký, không có
 * bảng quan hệ thay thế.
 *
 * `down()` chỉ **tạo lại cột rỗng** để `migration:check` chạy tiến/lùi/tiến sạch — **KHÔNG khôi phục
 * dữ liệu jsonb cũ** (dữ liệu đó đã có ở bảng phiên). Dựng lại đúng ràng buộc gốc `NOT NULL` bằng
 * cách thêm kèm `DEFAULT '{}'` (để bảng có sẵn dữ liệu không vi phạm) rồi bỏ default.
 */
export class DropForceProgressColumn1784075500000 implements MigrationInterface {
  name = 'DropForceProgressColumn1784075500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "declarations" DROP COLUMN IF EXISTS "forceProgress"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "declarations" ADD COLUMN IF NOT EXISTS "forceProgress" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(`ALTER TABLE "declarations" ALTER COLUMN "forceProgress" DROP DEFAULT`);
  }
}
