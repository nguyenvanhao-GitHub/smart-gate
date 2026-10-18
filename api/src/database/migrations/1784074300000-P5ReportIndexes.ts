import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P5 — chỉ mục phục vụ báo cáo và dashboard (F51–F56).
 *
 * **Không tạo bảng, không đổi cột, không xoá gì.** Toàn bộ nội dung là năm chỉ mục hỗ trợ các
 * truy vấn gộp nhóm mới:
 *
 * | Chỉ mục | Truy vấn được hưởng |
 * |---|---|
 * | `IDX_declarations_created_at` | Lọc theo kỳ của mọi báo cáo hồ sơ và của KPI dashboard |
 * | `IDX_declarations_status_created_at` | Bảy thẻ KPI đếm theo trạng thái trong kỳ |
 * | `IDX_workflow_instance_steps_step_status` | Bảng "trạng thái theo lực lượng" |
 * | `IDX_agency_actions_step_decision` | Báo cáo thời gian xử lý và quyết định theo lực lượng |
 * | `IDX_gate_events_decision` | Đếm lượt cho qua/bị chặn ở cổng |
 *
 * `declarations."createdAt"` trước nay **chưa có chỉ mục nào** dù màn hình danh sách đã lọc theo
 * nó từ P1 — đây cũng là lý do chỉ mục đầu tiên có mặt ở đây.
 *
 * `down()` xoá đúng năm chỉ mục này, không đụng chỉ mục do migration khác tạo.
 */
export class P5ReportIndexes1784074300000 implements MigrationInterface {
  name = 'P5ReportIndexes1784074300000';

  private readonly logger = new Logger('P5ReportIndexes');

  private readonly indexes = [
    'IDX_declarations_created_at',
    'IDX_declarations_status_created_at',
    'IDX_workflow_instance_steps_step_status',
    'IDX_agency_actions_step_decision',
    'IDX_gate_events_decision',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_declarations_created_at" ON "declarations" ("createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_declarations_status_created_at" ON "declarations" ("status", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_instance_steps_step_status"
       ON "workflow_instance_steps" ("step_code", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agency_actions_step_decision"
       ON "agency_actions" ("step_code", "decision")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_gate_events_decision" ON "gate_events" ("decision")`);

    await this.verify(queryRunner);
  }

  /** Thiếu chỉ mục nào là ném lỗi để TypeORM hoàn tác cả giao dịch. */
  private async verify(queryRunner: QueryRunner): Promise<void> {
    const found: Array<{ indexname: string }> = await queryRunner.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)`,
      [this.indexes],
    );
    const missing = this.indexes.filter((name) => !found.some((row) => row.indexname === name));

    this.logger.log(`Đối chiếu P5: chỉ mục ${found.length}/${this.indexes.length}.`);

    if (missing.length > 0) {
      throw new Error(`Migration P5 chưa tạo đủ chỉ mục: [${missing.join(', ')}]. Đã hoàn tác toàn bộ.`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of this.indexes) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${name}"`);
    }
  }
}
