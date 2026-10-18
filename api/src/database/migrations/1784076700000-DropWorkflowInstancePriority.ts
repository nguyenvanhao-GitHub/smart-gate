import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gỡ hẳn tính năng đánh dấu ưu tiên hồ sơ (F30). Cột `workflow_instances.priority` và chỉ mục
 * `IDX_workflow_instances_priority` không còn ai đọc/ghi: endpoint `POST /workflow/.../actions/priority`
 * cùng use-case đã xóa, bảng điều phối không còn xếp xe ưu tiên đầu cột, mapper/domain/orm-entity đã
 * ngừng tham chiếu.
 *
 * `down()` **tạo lại cột rỗng** (mọi hồ sơ về mặc định `NORMAL`) và chỉ mục để `migration:check` chạy
 * tiến/lùi/tiến sạch — **KHÔNG khôi phục** mức ưu tiên cũ (dữ liệu đó đã bị bỏ cùng tính năng).
 */
export class DropWorkflowInstancePriority1784076700000 implements MigrationInterface {
  name = 'DropWorkflowInstancePriority1784076700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_workflow_instances_priority"`);
    await queryRunner.query(`ALTER TABLE "workflow_instances" DROP COLUMN IF EXISTS "priority"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workflow_instances" ADD COLUMN IF NOT EXISTS "priority" character varying(16) NOT NULL DEFAULT 'NORMAL'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_instances_priority" ON "workflow_instances" ("priority")`,
    );
  }
}
